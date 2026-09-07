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

## Running it locally

You need Node.js installed (for the build step) and any way to serve
static files (for the app itself — no server-side code required).

```bash
# 1. Regenerate recipes.json from your recipes/ + ingredients.json
node build/compile.js

# 2. Serve the folder (pick one)
npx serve .
# or
python3 -m http.server 8000
```

Then open the printed local URL (e.g. `http://localhost:3000` or
`http://localhost:8000`) in your browser.

Whenever you add, edit, or remove a recipe `.md` file, or edit
`ingredients.json`, re-run `node build/compile.js` and refresh the
page. Inside the app, use "Reload from recipes.json" in the Meal
Library section to pick up the new data without losing your existing
day-by-day calendar assignments (that part is saved separately, in
your browser's local storage).

## Deploying to GitHub Pages later

1. Run `node build/compile.js` locally and commit the resulting
   `recipes.json` along with everything else — Pages only serves
   static files, it can't run the build step for you.
2. Push the repo to GitHub.
3. In the repo's Settings → Pages, set the source to your default
   branch (root folder).
4. Your app will be live at `https://<username>.github.io/<repo>/`.

Because calendar/plan data is stored in each visitor's own browser
(`localStorage`), it's private per-device and won't sync across
devices unless you add a real backend later.
