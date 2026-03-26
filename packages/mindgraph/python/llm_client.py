"""
Multi-provider LLM client for Graphiti.

Supports OpenAI-compatible APIs (OpenAI, DashScope) and native Anthropic API.
Uses chat.completions with JSON schema in system prompt for OpenAI-compatible,
and Messages API for Anthropic.
"""

import json
import logging
import os
import typing

from openai import AsyncOpenAI
from openai.types.chat import ChatCompletionMessageParam
from pydantic import BaseModel

from graphiti_core.llm_client.config import DEFAULT_MAX_TOKENS, LLMConfig
from graphiti_core.llm_client.openai_base_client import (
    DEFAULT_REASONING,
    DEFAULT_VERBOSITY,
    BaseOpenAIClient,
)

logger = logging.getLogger(__name__)


class LLMClient(BaseOpenAIClient):
    """
    A Graphiti LLM client supporting OpenAI-compatible APIs and native Anthropic API.

    Uses chat.completions with JSON mode for OpenAI/DashScope,
    and the Messages API for Anthropic.
    """

    def __init__(
        self,
        config: LLMConfig | None = None,
        cache: bool = False,
        client: typing.Any = None,
        max_tokens: int = DEFAULT_MAX_TOKENS,
        reasoning: str = DEFAULT_REASONING,
        verbosity: str = DEFAULT_VERBOSITY,
    ):
        super().__init__(config, cache, max_tokens, reasoning, verbosity)

        if config is None:
            config = LLMConfig()

        self._is_anthropic = os.environ.get("LLM_PROVIDER", "").lower() == "anthropic"
        self._is_dashscope = config.base_url and "dashscope" in config.base_url

        if self._is_anthropic:
            try:
                import anthropic
                self.anthropic_client = anthropic.AsyncAnthropic(api_key=config.api_key)
            except ImportError:
                logger.warning("anthropic package not installed, falling back to OpenAI-compatible mode")
                self._is_anthropic = False
                self.client = AsyncOpenAI(api_key=config.api_key, base_url=config.base_url) if client is None else client
        else:
            if client is None:
                self.client = AsyncOpenAI(api_key=config.api_key, base_url=config.base_url)
            else:
                self.client = client

    def _schema_to_prompt(self, response_model: type[BaseModel]) -> str:
        """Convert a Pydantic model to a JSON schema instruction for the prompt."""
        schema = response_model.model_json_schema()
        return (
            f"\n\nYou MUST respond with valid JSON that exactly matches this JSON schema. "
            f"Use the EXACT field names from the schema (not similar names). "
            f"Do NOT wrap the JSON in markdown code blocks.\n\n"
            f"JSON Schema:\n```json\n{json.dumps(schema, indent=2)}\n```"
        )

    async def _create_structured_completion(
        self,
        model: str,
        messages: list[ChatCompletionMessageParam],
        temperature: float | None,
        max_tokens: int,
        response_model: type[BaseModel],
        reasoning: str | None = None,
        verbosity: str | None = None,
    ):
        """Create a structured completion using chat.completions + JSON mode."""
        schema_instruction = self._schema_to_prompt(response_model)

        if self._is_anthropic:
            return await self._anthropic_structured(
                model, messages, temperature, max_tokens, response_model, schema_instruction
            )

        # OpenAI-compatible path
        augmented_messages = []
        system_found = False
        for msg in messages:
            if msg.get("role") == "system":
                augmented_messages.append({
                    "role": "system",
                    "content": msg["content"] + schema_instruction,
                })
                system_found = True
            else:
                augmented_messages.append(msg)

        if not system_found:
            augmented_messages.insert(0, {
                "role": "system",
                "content": "You are a helpful assistant." + schema_instruction,
            })

        kwargs = dict(
            model=model,
            messages=augmented_messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        if self._is_dashscope:
            kwargs["extra_body"] = {"enable_thinking": False}

        response = await self.client.chat.completions.create(**kwargs)

        return _StructuredResponse(response, response_model)

    async def _create_completion(
        self,
        model: str,
        messages: list[ChatCompletionMessageParam],
        temperature: float | None,
        max_tokens: int,
        response_model: type[BaseModel] | None = None,
    ):
        """Create a regular completion with JSON format."""
        if self._is_anthropic:
            return await self._anthropic_completion(model, messages, temperature, max_tokens)

        # OpenAI-compatible path
        kwargs = dict(
            model=model,
            messages=messages,
            temperature=temperature,
            max_tokens=max_tokens,
            response_format={"type": "json_object"},
        )
        if self._is_dashscope:
            kwargs["extra_body"] = {"enable_thinking": False}

        return await self.client.chat.completions.create(**kwargs)

    # ── Anthropic-specific methods ──

    async def _anthropic_structured(
        self, model, messages, temperature, max_tokens, response_model, schema_instruction
    ):
        """Structured completion via Anthropic Messages API."""
        system_text, user_messages = self._split_anthropic_messages(messages)
        system_text = (system_text or "You are a helpful assistant.") + schema_instruction
        system_text += "\n\nYou MUST respond with valid JSON only. No markdown code blocks."

        response = await self.anthropic_client.messages.create(
            model=model,
            system=system_text,
            messages=user_messages,
            temperature=temperature or 0.1,
            max_tokens=max_tokens,
        )
        return _AnthropicStructuredResponse(response, response_model)

    async def _anthropic_completion(self, model, messages, temperature, max_tokens):
        """Regular completion via Anthropic Messages API."""
        system_text, user_messages = self._split_anthropic_messages(messages)
        if system_text:
            system_text += "\n\nYou MUST respond with valid JSON only. No markdown code blocks."
        else:
            system_text = "You MUST respond with valid JSON only. No markdown code blocks."

        response = await self.anthropic_client.messages.create(
            model=model,
            system=system_text,
            messages=user_messages,
            temperature=temperature or 0.1,
            max_tokens=max_tokens,
        )
        return _AnthropicCompletionResponse(response)

    @staticmethod
    def _split_anthropic_messages(messages):
        """Split OpenAI-format messages into Anthropic system + messages."""
        system_parts = []
        user_messages = []
        for msg in messages:
            if msg.get("role") == "system":
                system_parts.append(msg["content"])
            else:
                user_messages.append({"role": msg["role"], "content": msg["content"]})
        # Anthropic requires at least one user message
        if not user_messages:
            user_messages.append({"role": "user", "content": "Please respond."})
        return "\n\n".join(system_parts) if system_parts else None, user_messages


class _AnthropicUsage:
    """Mimic OpenAI usage object from Anthropic response."""
    def __init__(self, response):
        u = response.usage
        self.prompt_tokens = u.input_tokens
        self.completion_tokens = u.output_tokens
        self.total_tokens = u.input_tokens + u.output_tokens


class _AnthropicStructuredResponse:
    """Wrapper that makes an Anthropic response look like a structured OpenAI response."""
    def __init__(self, response, response_model: type[BaseModel]):
        raw_text = response.content[0].text if response.content else "{}"
        # Strip markdown code blocks if present
        text = raw_text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        try:
            data = json.loads(text)
            data = _StructuredResponse._fix_field_names(data, response_model)
            text = json.dumps(data)
        except (json.JSONDecodeError, Exception):
            pass

        self.output_text = text
        self.usage = _AnthropicUsage(response)


class _AnthropicCompletionResponse:
    """Wrapper that makes an Anthropic response look like an OpenAI chat.completions response."""
    def __init__(self, response):
        text = response.content[0].text if response.content else ""
        self.choices = [type("Choice", (), {
            "message": type("Message", (), {"content": text})()
        })()]
        self.usage = _AnthropicUsage(response)


class _StructuredResponse:
    """
    Wrapper that makes a chat.completions response look like
    a responses.parse() response for BaseOpenAIClient._handle_structured_response.
    """

    def __init__(self, raw_response, response_model: type[BaseModel]):
        raw_text = raw_response.choices[0].message.content or "{}"

        # Strip markdown code blocks if present
        text = raw_text.strip()
        if text.startswith("```json"):
            text = text[7:]
        if text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        # Try to validate and fix common field name mismatches
        try:
            data = json.loads(text)
            data = self._fix_field_names(data, response_model)
            text = json.dumps(data)
        except (json.JSONDecodeError, Exception):
            pass

        self.output_text = text
        self.usage = raw_response.usage

    @staticmethod
    def _fix_field_names(data: dict, model: type[BaseModel]) -> dict:
        """Try to map wrong field names to the expected ones."""
        if not isinstance(data, dict):
            return data

        expected_fields = set(model.model_fields.keys())
        actual_fields = set(data.keys())

        # If fields already match, return as-is
        if expected_fields == actual_fields:
            return data

        # Common mismatches: try to map missing fields
        fixed = {}
        for expected in expected_fields:
            if expected in data:
                fixed[expected] = data[expected]
            else:
                # Try fuzzy match: look for fields containing the expected name
                for actual_key, actual_val in data.items():
                    if expected in actual_key or actual_key in expected:
                        fixed[expected] = actual_val
                        break

        # If we found all expected fields, use fixed version
        if expected_fields == set(fixed.keys()):
            # Also fix nested items if they're lists of dicts
            for key, value in fixed.items():
                field_info = model.model_fields.get(key)
                if field_info and isinstance(value, list):
                    # Try to get the inner type for list fields
                    inner_type = _get_list_inner_type(field_info)
                    if inner_type and issubclass(inner_type, BaseModel):
                        fixed[key] = [
                            _fix_nested_fields(item, inner_type)
                            if isinstance(item, dict) else item
                            for item in value
                        ]
            return fixed

        # Couldn't fix, return original and let validation catch it
        return data


def _get_list_inner_type(field_info) -> type | None:
    """Extract the inner type from a List[SomeModel] annotation."""
    import typing as t
    annotation = field_info.annotation
    origin = getattr(annotation, "__origin__", None)
    if origin is list:
        args = getattr(annotation, "__args__", ())
        if args:
            return args[0]
    return None


def _fix_nested_fields(data: dict, model: type[BaseModel]) -> dict:
    """Fix field names in nested dicts."""
    if not isinstance(data, dict):
        return data

    expected_fields = set(model.model_fields.keys())
    actual_fields = set(data.keys())

    if expected_fields == actual_fields:
        return data

    fixed = {}
    used_actual = set()

    for expected in expected_fields:
        if expected in data:
            fixed[expected] = data[expected]
            used_actual.add(expected)
        else:
            # Fuzzy match
            for actual_key in data:
                if actual_key in used_actual:
                    continue
                # Match: entity_name -> name, entity_type_name -> entity_type
                if expected in actual_key or actual_key.endswith("_" + expected):
                    fixed[expected] = data[actual_key]
                    used_actual.add(actual_key)
                    break
                # Match: name -> entity_name
                if actual_key in expected:
                    fixed[expected] = data[actual_key]
                    used_actual.add(actual_key)
                    break

    # For any remaining expected fields not found, try harder
    for expected in expected_fields:
        if expected not in fixed:
            # Try removing common prefixes
            for actual_key in data:
                if actual_key in used_actual:
                    continue
                # Strip "entity_" prefix and compare
                stripped = actual_key.replace("entity_", "")
                if stripped == expected:
                    fixed[expected] = data[actual_key]
                    used_actual.add(actual_key)
                    break

    if expected_fields == set(fixed.keys()):
        return fixed

    return data
