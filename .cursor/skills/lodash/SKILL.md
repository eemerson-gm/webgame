---
name: lodash
description: Quick memory aid for the most commonly used lodash helpers.
---

# Lodash (Common Helpers)

## Collections
- `map`: transform each item to a new list
- `filter`: keep items that match a predicate
- `reduce`: fold items into a single accumulated value
- `flatMap`: map then flatten one level
- `groupBy`: bucket items by a computed key (array of buckets)
- `keyBy`: bucket items by a computed key (object of single items)
- `sortBy`: stable sort by a computed iteratee
- `some`: true if any item matches
- `every`: true if all items match
- `find`: return the first matching item (or `undefined`)

## Uniqueness
- `uniq`: remove duplicates (by value)
- `uniqBy`: remove duplicates (by computed key)

## Objects
- `get`: safe deep read by path (no need to guard)
- `set`: safe deep write by path
- `has`: check if a path exists
- `pick`: keep only specified keys
- `omit`: remove specified keys
- `merge`: deep merge objects (later values overwrite)
- `mergeWith`: like `merge`, but customize merge behavior per value
- `defaults`: apply default values only when a key is missing

## Cloning
- `cloneDeep`: deep copy (breaks shared references)

## Async timing
- `debounce`: delay execution until changes stop (use for input)
- `throttle`: run at most once per interval (use for resize/scroll)

