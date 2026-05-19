/**
 * Category-aware flashcard templates for menu items.
 * Matches Charleston's Server Training Manual structure.
 */

export function getCategoryTemplate(category, subcategory) {
  const cat = (category || '').toLowerCase()
  const sub = (subcategory || '').toLowerCase()

  if (cat.includes('soup') || sub.includes('soup') || sub.includes('chili') || sub.includes('chowder') || sub.includes('gumbo')) {
    return {
      type: 'soup',
      format: `Format the back EXACTLY like this structure:
[Item name on first line]
[blank line]
Garnish:
• [garnish item 1]
• [garnish item 2]

If the soup has a base worth noting (cream-based, broth-based, etc.), add a "Base:" line before Garnish.`,
      example: `{"front": "Chicken Tortilla", "back": "Chicken Tortilla\\n\\nGarnish:\\n• Zebra Cheese\\n• Tortilla Strips"}`,
    }
  }

  if (cat.includes('burger') || cat.includes('sandwich') || sub.includes('burger') || sub.includes('sandwich') || sub.includes('club') || sub.includes('french dip') || sub.includes('wrap')) {
    return {
      type: 'sandwich',
      format: `Format the back EXACTLY like this structure:
[Bread/bun type]
• [Protein — include weight if known]
• [Topping 1]
• [Topping 2]
• [Sauce/condiment]
Served with: [sides, e.g. FF or Slaw]

If there's something the server needs to ASK the guest, add: "Ask: [question]"`,
      example: `{"front": "Famous French Dip", "back": "French Roll\\n• 8 oz. Thinly Sliced Prime Rib\\n• Mayonnaise\\n• Au Jus\\nAsk: Creamy or Raw Horseradish\\nServed with: Choice of FF or Slaw"}`,
    }
  }

  if (cat.includes('salad') || sub.includes('salad') || sub.includes('caesar')) {
    return {
      type: 'salad',
      format: `Format the back EXACTLY like this structure:
Base:
• [greens/base ingredients]

Toppings:
• [topping 1]
• [topping 2]

Dressing: [dressing name]

If protein is included, add "Protein:" section.`,
      example: `{"front": "Walt's Champagne Chicken Salad", "back": "Protein:\\n• Hardwood Grilled Chicken\\n\\nBase & Toppings:\\n• Pineapple\\n• Dates\\n• Croutons\\n• Spiced Pecans\\n• Feta Cheese\\n• Strawberries\\n• Sunflower Seeds\\n\\nDressing: Citrus Champagne Vinaigrette"}`,
    }
  }

  if (cat.includes('steak') || sub.includes('steak') || sub.includes('filet') || sub.includes('sirloin') || sub.includes('prime rib') || sub.includes('ribeye')) {
    return {
      type: 'steak',
      format: `Format the back EXACTLY like this structure:
• [Weight/cut]
• [Preparation method]
• [Special notes — e.g. "Well Done = Medallioned"]
Sides:
• [Side 1]
• [Side 2 — e.g. House or Caesar Salad]

If available in multiple sizes, note them.`,
      example: `{"front": "Filet", "back": "• 7 oz.\\n• Seasoned & HWG\\n• Well Done = Medallioned\\nSides:\\n• Mixed Vegetables\\n• House or Caesar Salad"}`,
    }
  }

  if (sub.includes('chicken') || sub.includes('poultry')) {
    return {
      type: 'chicken',
      format: `Format the back EXACTLY like this structure:
• [Portion size/count]
• [Preparation method]
• [Sauce or coating]
Sides:
• [Side 1]
• [Side 2]

Note any allergens (e.g. "Contains Nuts") if known.`,
      example: `{"front": "Parmesan Crusted Chicken", "back": "• Two 3 oz. Parmesan Crusted Chicken Breasts\\n• Angel Hair Pasta\\n• Marinara Sauce\\n• Field Green Salad w/ Mozzarella, Grape Tomatoes, Red Onion in Herbal Vinaigrette\\n\\n⚠️ Crust Contains Nuts"}`,
    }
  }

  if (cat.includes('seafood') || cat.includes('fish') || sub.includes('fish') || sub.includes('salmon') || sub.includes('shrimp') || sub.includes('catfish') || sub.includes('redfish') || sub.includes('taco')) {
    return {
      type: 'seafood',
      format: `Format the back EXACTLY like this structure:
• [Protein — type, weight, count]
• [Preparation method]
• [Sauce]
Sides:
• [Side 1]
• [Side 2]

If it's a taco/wrap, list the vessel first (e.g. "2 Corn Tortillas").`,
      example: `{"front": "Shrimp Scampi", "back": "• 8 Jumbo Shrimp\\n• Sautéed in Garlic and Lemon Butter\\n• Tomatoes\\n• Angel Hair Pasta\\n• Cheese Bread"}`,
    }
  }

  if (sub.includes('rib') || sub.includes('bbq') || sub.includes('pork')) {
    return {
      type: 'bbq',
      format: `Format the back EXACTLY like this structure:
• [Cut/portion]
• [Preparation/sauce]
Sides:
• [Side 1]
• [Side 2]

If finger linen is needed, note: "Finger linen prior to delivery"`,
      example: `{"front": "Baby Back Ribs", "back": "• Full Rack of Pork Ribs\\n• BBQ Sauce\\nSides:\\n• FF\\n• Beans\\n\\nFinger linen prior to delivery"}`,
    }
  }

  if (cat.includes('starter') || cat.includes('appetizer') || cat.includes('app') || sub.includes('starter') || sub.includes('appetizer') || sub.includes('dip') || sub.includes('shareables')) {
    return {
      type: 'starter',
      format: `Format the back EXACTLY like this structure:
[Item name]

• [Component/ingredient 1]
• [Component/ingredient 2]
• [Sauce or dipping accompaniment]

If it's a shareable, note serving style.`,
      example: `{"front": "Spinach & Artichoke Dip", "back": "Spinach & Artichoke Dip\\n\\n• Spinach\\n• Artichokes\\n• Parmesan Cheese Sauce\\n• Melted Jack Cheese\\n• Salsa, Sour Cream\\n• Fresh Tortilla Chips"}`,
    }
  }

  if (cat.includes('kid') || sub.includes('kid') || sub.includes('child')) {
    return {
      type: 'kids',
      format: `Format the back EXACTLY like this:
• [Main item description]
Comes with:
• Kid Beverage
• Cookie w/ Ice Cream w/ Chocolate Sauce`,
      example: `{"front": "Kid Chicken Tenders", "back": "• Chicken Tenders with FF\\nComes with:\\n• Kid Beverage\\n• Cookie w/ Ice Cream w/ Chocolate Sauce"}`,
    }
  }

  if (cat.includes('dessert') || sub.includes('dessert') || sub.includes('cake') || sub.includes('pie') || sub.includes('cheesecake')) {
    return {
      type: 'dessert',
      format: `Format the back EXACTLY like this:
• [Description of dessert]
• [Key ingredients or layers]
• [Topping/sauce/garnish]
• [Served warm/cold, à la mode, etc.]`,
      example: `{"front": "Chocolate Lava Cake", "back": "• Warm Chocolate Cake\\n• Molten Chocolate Center\\n• Vanilla Ice Cream\\n• Chocolate Sauce\\n• Served Warm"}`,
    }
  }

  if (cat.includes('drink') || cat.includes('bar') || cat.includes('cocktail') || cat.includes('beer') || cat.includes('wine') || sub.includes('martini') || sub.includes('margarita')) {
    return {
      type: 'drink',
      format: `Format the back EXACTLY like this:
• [Base spirit or type]
• [Mixer/ingredient 1]
• [Mixer/ingredient 2]
• [Garnish]
Glass: [glass type if known]
Size: [size options if applicable]`,
      example: `{"front": "Bourbon Sour", "back": "• Bourbon\\n• Fresh Lemon Juice\\n• Simple Syrup\\n• Egg White\\n• Angostura Bitters\\nGarnish: Cherry & Orange"}`,
    }
  }

  if (cat.includes('side') || sub.includes('side')) {
    return {
      type: 'side',
      format: `Format the back as a simple description:
• [What it is]
• [Key preparation details]`,
      example: `{"front": "Garlic Mashed Potatoes", "back": "• Creamy Mashed Potatoes\\n• Roasted Garlic\\n• Butter"}`,
    }
  }

  return {
    type: 'generic',
    format: `Format the back as a clean bulleted ingredient/component list:
• [Component 1]
• [Component 2]
• [Sauce/garnish]
Sides: [accompaniments if applicable]`,
    example: `{"front": "Menu Item Name", "back": "• Ingredient 1\\n• Ingredient 2\\n• Sauce\\nSides:\\n• Side 1\\n• Side 2"}`,
  }
}

export function buildFlashcardPrompt(itemName, description, price, category, subcategory, userNotes = '') {
  const template = getCategoryTemplate(category, subcategory)

  return `You are formatting a menu item into a structured training flashcard for Charleston's restaurant staff.

MENU ITEM:
Name: ${itemName}
Description: ${description || 'No description available'}
Price: ${price ? '$' + price : 'Not specified'}
Category: ${category || 'Unknown'} / ${subcategory || 'Unknown'}

ADDITIONAL NOTES FROM MANAGER:
${userNotes || '(none)'}

Incorporate these notes into the flashcard back. They are insider knowledge from the restaurant.

FORMAT RULES:
- The "front" is ONLY the menu item name exactly as it appears on the menu. Nothing else. No questions.
- The "back" uses bullet points (•) for each component, with labeled sections where appropriate.
- Extract EVERY ingredient, component, sauce, side, garnish, and preparation detail.
- Include weights/portions if mentioned (e.g. "8 oz.", "Two 3 oz.").
- Include cooking method (HWG, grilled, blackened, fried, sautéed, etc.).
- Include server action items (e.g. "Ask: Creamy or Raw Horseradish", "Finger linen prior to delivery").
- Do NOT include the price.
- Keep it factual — only what's actually in/on/with the item.

${template.format}

EXAMPLE:
${template.example}

Also generate 2-3 specific training quiz questions about this item. These should test a server's knowledge of key details: protein weight/type, sauce, cooking method, sides, allergens, garnish, etc. Only ask about details that are actually present in the description.

CRITICAL: Return ONLY valid JSON with "front", "back", and "questions" keys. No markdown, no backticks, no explanation.

{
  "front": "Item Name",
  "back": "• details...",
  "questions": [
    { "q": "What protein is in the [item] and how much?", "a": "8oz chicken breast" },
    { "q": "What sauce comes on the [item]?", "a": "Lemon caper sauce" }
  ]
}

Generate the flashcard now:`
}
