import { useState, useEffect } from "react";
import { CATEGORY_COLORS, CATEGORY_LABELS } from "./constants";

let _cache = null;
let _fetching = false;
let _listeners = [];

function notifyListeners() {
  _listeners.forEach(fn => fn({ ..._cache }));
}

function fetchCategories() {
  if (_fetching) return;
  _fetching = true;
  fetch("/api/categories")
    .then(r => r.json())
    .then(cats => {
      if (Array.isArray(cats)) {
        _cache = { colors: {}, labels: {} };
        cats.forEach(c => {
          _cache.colors[c.key] = c.color || "#888";
          _cache.labels[c.key] = c.label || c.key;
        });
        notifyListeners();
      }
      _fetching = false;
    })
    .catch(() => { _fetching = false; });
}

/**
 * Hook that returns dynamic category colors and labels.
 * Fetches from API once, caches globally, updates all consumers.
 */
export function useCategoryColors() {
  const [data, setData] = useState(_cache || { colors: CATEGORY_COLORS, labels: CATEGORY_LABELS });

  useEffect(() => {
    _listeners.push(setData);
    if (!_cache) fetchCategories();
    return () => { _listeners = _listeners.filter(fn => fn !== setData); };
  }, []);

  return data;
}

/** Force re-fetch categories (call after create/edit/delete category) */
export function refreshCategoryCache() {
  _cache = null;
  fetchCategories();
}
