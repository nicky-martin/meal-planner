// compile.js
// Reads every recipes/*.md file, parses it by convention, enriches
// ingredients against ingredients.json (fuzzy-matched), and writes
// recipes.json to the project root.
//
// Run with:  node build/compile.js
// Zero dependencies — just Node's built-in fs/path.

const fs = require('fs');
const path = require('path');

const RECIPES_DIR = path.join(__dirname, '..', 'recipes');
const INGREDIENTS_PATH = path.join(__dirname, '..', 'ingredients.json');
const OUTPUT_PATH = path.join(__dirname, '..', 'recipes.json');

const MEAL_SLOTS = ['Breakfast', 'Lunch', 'Dinner'];

function slugify(str) {
  return str.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

function loadIngredientRegistry() {
  if (!fs.existsSync(INGREDIENTS_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(INGREDIENTS_PATH, 'utf8'));
  } catch (e) {
    console.warn(`Could not parse ${INGREDIENTS_PATH}, continuing without it.`);
    return {};
  }
}

// Strips quantities, prep words, and asides from a raw ingredient line
// so it has a better chance of matching a clean registry key like
// "garlic" or "olive oil". e.g. "Garlic, 2 cloves, minced" -> "garlic"
const STOPWORDS = [
  'fresh', 'frozen', 'minced', 'diced', 'chopped', 'sliced', 'thinly',
  'shredded', 'canned', 'ground', 'large', 'small', 'medium', 'optional',
  'cooked', 'steamed', 'roasted', 'cubed', 'package', 'packet', 'cloves',
  'clove', 'juice', 'zest', 'or', 'and', 'for', 'serving', 'x1', 'x2', 'x3',
  'thin', 'bag', 'good', 'plain', 'a', 'the', 'to', 'taste'
];

function normalize(raw) {
  let s = raw.toLowerCase();
  s = s.replace(/\([^)]*\)/g, ' ');       // drop parentheticals
  s = s.replace(/\d+(\.\d+)?/g, ' ');      // drop numbers
  s = s.replace(/[,\/]/g, ' ');            // commas/slashes -> space
  s = ' ' + s + ' ';
  STOPWORDS.forEach(w => {
    s = s.replace(new RegExp(`\\s${w}\\s`, 'g'), ' ');
  });
  return s.replace(/\s+/g, ' ').trim();
}

function findRegistryKey(rawName, registry) {
  const keys = Object.keys(registry);
  const norm = canonicalKey(normalize(rawName));
  if (registry[norm]) return norm;

  // longest-key-first substring match in both directions
  const sorted = keys.slice().sort((a, b) => b.length - a.length);
  for (const key of sorted) {
    if (norm.includes(key) || key.includes(norm)) {
      return key;
    }
  }
  return null;
}

// Common misspellings/variants seen across recipe files, mapped to
// whichever registry key is canonical, so they aggregate as one
// ingredient instead of showing up as separate grocery-list lines.
const ALIASES = {
  'potatos': 'potatoes',
  'brocoli': 'broccoli',
  'scalion pancake': 'scallion pancake'
};
function canonicalKey(norm) {
  return ALIASES[norm] || norm;
}

function titleCase(s) {
  return s.replace(/\b\w/g, c => c.toUpperCase());
}

// Pulls a purchase-quantity multiplier out of a raw ingredient line,
// e.g. "Granola, 1/5th package" -> 0.2, "Yakisoba noodles x2" -> 2.
// Everything else defaults to 1 (one normal use = one purchase unit).
function extractAmount(raw) {
  const fracMatch = raw.match(/(\d+)\s*\/\s*(\d+)\s*(?:th|st|nd|rd)?/i);
  if (fracMatch) {
    const amount = parseInt(fracMatch[1], 10) / parseInt(fracMatch[2], 10);
    const cleaned = raw.replace(fracMatch[0], '').replace(/^[,\s]+|[,\s]+$/g, '').replace(/\s{2,}/g, ' ').trim();
    return { amount, cleaned: cleaned || raw };
  }
  const xMatch = raw.match(/\bx\s*(\d+)\b/i);
  if (xMatch) {
    const amount = parseInt(xMatch[1], 10);
    const cleaned = raw.replace(xMatch[0], '').replace(/\s{2,}/g, ' ').trim();
    return { amount, cleaned: cleaned || raw };
  }
  return { amount: 1, cleaned: raw };
}

// Convention:
//   # Recipe Name
//   tags: a, b, c            <- comma separated; every tag shows up as a
//                                filter chip. Breakfast/Lunch/Dinner among
//                                them also become this recipe's "slots"
//                                (used only for the "Surprise me" shuffle).
//   ## Ingredients
//   - item
//   ## Instructions
//   1. step
function parseRecipeMarkdown(raw, filename) {
  const lines = raw.split('\n').map(l => l.trim());

  const nameLine = lines.find(l => l.startsWith('# '));
  const name = nameLine ? nameLine.replace(/^#\s*/, '').trim() : filename;

  const tagsLine = lines.find(l => /^tags:/i.test(l));
  const tags = tagsLine
    ? tagsLine.split(':')[1].split(',').map(t => t.trim()).filter(Boolean)
    : [];

  const slots = [...new Set(tags.filter(t => MEAL_SLOTS.includes(t)))];

  const ingredients = extractSection(lines, 'Ingredients')
    .filter(l => l.startsWith('- '))
    .map(l => l.replace(/^-\s*/, '').trim())
    .filter(Boolean);

  const instructions = extractSection(lines, 'Instructions')
    .filter(l => /^\d+\.\s/.test(l))
    .map(l => l.replace(/^\d+\.\s*/, '').trim());

  return {
    id: 'meal_' + slugify(name),
    name,
    slots: slots.length ? slots : ['Dinner'],
    tags,
    ingredients,
    instructions,
    sourceFile: filename
  };
}

function extractSection(lines, headingName) {
  const startIdx = lines.findIndex(l => l.toLowerCase() === `## ${headingName.toLowerCase()}`);
  if (startIdx === -1) return [];
  const rest = lines.slice(startIdx + 1);
  const endIdx = rest.findIndex(l => l.startsWith('## '));
  return endIdx === -1 ? rest : rest.slice(0, endIdx);
}

function enrichIngredients(recipe, registry) {
  let knownTotalPrice = 0;
  let knownTotalCalories = 0;
  const unmatched = [];

  const enriched = recipe.ingredients.map(rawName => {
    const { amount, cleaned } = extractAmount(rawName);
    const matchedKey = findRegistryKey(cleaned, registry) || findRegistryKey(rawName, registry);
    const match = matchedKey ? registry[matchedKey] : null;

    if (match) {
      knownTotalPrice += (match.price || 0) * amount;
      knownTotalCalories += (match.calories || 0) * amount;
      return {
        raw: rawName,
        ingredientId: slugify(matchedKey),
        displayName: titleCase(matchedKey),
        amount,
        price: match.price,
        calories: match.calories,
        aisle: match.aisle
      };
    } else {
      unmatched.push(rawName);
      const fallback = normalize(cleaned) || cleaned;
      return {
        raw: rawName,
        ingredientId: slugify(fallback),
        displayName: titleCase(fallback),
        amount,
        aisle: 'Other'
      };
    }
  });

  return {
    ...recipe,
    ingredients: enriched,
    estimatedPrice: Math.round(knownTotalPrice * 100) / 100,
    estimatedCalories: Math.round(knownTotalCalories),
    unmatchedIngredients: unmatched
  };
}

function main() {
  const registry = loadIngredientRegistry();

  if (!fs.existsSync(RECIPES_DIR)) {
    console.error(`No recipes/ folder found at ${RECIPES_DIR}`);
    console.error(`Create it and put your .md recipe files inside, then re-run this.`);
    process.exit(1);
  }

  const files = fs.readdirSync(RECIPES_DIR).filter(f => f.endsWith('.md'));
  const recipes = files.map(filename => {
    const raw = fs.readFileSync(path.join(RECIPES_DIR, filename), 'utf8');
    const parsed = parseRecipeMarkdown(raw, filename);
    return enrichIngredients(parsed, registry);
  });

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(recipes, null, 2));

  console.log(`Compiled ${recipes.length} recipes -> ${path.relative(process.cwd(), OUTPUT_PATH)}`);
  recipes.forEach(r => {
    const flag = r.unmatchedIngredients.length
      ? `  (unmatched: ${r.unmatchedIngredients.join(', ')})`
      : '';
    console.log(`  - ${r.name} [${r.slots.join('/')}]: $${r.estimatedPrice}, ${r.estimatedCalories} cal${flag}`);
  });
}

main();