# Weekly Menu Planner

A meal-planning calendar with a grocery-list generator, built from your
own recipe collection.

## How it fits together

```
meal-planner/
  recipes/*.md        <- one file per recipe (edit these)
  ingredients.json    <- price/calorie/aisle lookup for grocery totals
  build/compile.js    <- reads recipes/ + ingredients.json -> recipes.json
  recipes.json        <- generated; do not hand-edit
  index.html          <- the app itself (calendar + grocery list)
```

`index.html` fetches `recipes.json` in the browser, so it needs to be
served over HTTP (see below) — opening it directly as a `file://` URL
will fail to load recipes due to browser security rules.

## Recipe file format

Each file in `recipes/` looks like:

```markdown
# Recipe Name

tags: Italian, Vegetarian, Quick, Dinner

## Ingredients
- Broccoli
- Pasta
- Garlic

## Instructions
1. Do the thing.
2. Do the next thing.
```

- Any of `Breakfast`, `Lunch`, `Dinner` in `tags:` decides which
  section(s) of the Meal Library the recipe shows up in. A recipe can
  belong to more than one (e.g. `tags: Quick, Lunch, Dinner`).
- Ingredient matching against `ingredients.json` is fuzzy (it strips
  words like "fresh", "minced", "x2", parentheticals, etc. before
  comparing), but it isn't perfect — recipes with unmatched
  ingredients still get compiled, they just show up in the grocery
  list without a price and under the "Other" aisle.
