/**
 * Reference answers for the verbal certification sign-off — lets the manager
 * see (and, for multi-part answers, check off) what the trainee is supposed
 * to say, instead of relying on the manager's own memory.
 *
 * Sourced from the existing flashcards content (verbal_cert / bar-beer /
 * starters-soups-salads / steaks-specialties / wines-cocktails sets) and
 * standardsData.js. Keyed by the exact question/item text in
 * verbalCertQuestions.js — additive only, that file is untouched.
 *
 * Not every item has an entry: some genuinely have no fixed answer (a
 * rotating daily special, a "sell me your favorite" pitch prompt) and some
 * are real content gaps not yet in the flashcards (noted inline). Those stay
 * as a plain pass/fail item with no revealed answer, same as before this
 * feature existed. Phase 5 is intentionally not covered here.
 *
 * type: 'single' — one fact, shown as reference text, no checklist.
 * type: 'checklist' — multiple parts; the manager checks off each part
 * as the trainee names it. `note` is a supplemental detail shown below the list.
 */

export const PHASE2_ANSWERS = {
  'What is our phone number?': { type: 'single', text: 'Carmel: (317) 846-5965 · Indianapolis: (317) 841-0442' },
  'What is our address?': { type: 'single', text: 'Carmel: 14636 Greyhound Plaza, Carmel, IN 46032 · Indianapolis: 6815 E. 82nd Street, Indianapolis, IN 46250' },
  'Who is the General Manager? Name our Managers.': { type: 'single', text: 'Owner: Gary Richenberg. General Managers: Adam Standridge / Adam Skees / Ben Goode. Kitchen Manager: Jorge Pineda.' },
  'When is your schedule request due?': { type: 'single', text: 'Sunday, two weeks prior to the posting of the new schedule.' },
  'Who writes your schedule?': { type: 'single', text: 'The General Manager or Scheduling Manager.' },
  'Where do you park?': { type: 'single', text: 'Carmel: south side of the building, 2 rows back (front of Best Buy). Indianapolis: back of the restaurant.' },
  'What is the proper way to answer the phone?': { type: 'single', text: '"Good [Morning/Afternoon/Evening], Charleston\'s [Location], this is [Name]."' },
  'How do you place someone on hold?': { type: 'single', text: 'Ask permission first: "May I place you on a brief hold?" — and wait for their answer.' },
  'Do we take checks? Traveler checks?': { type: 'single', text: 'No personal checks.' },
  'What credit cards do we accept?': { type: 'checklist', items: ['Visa', 'MasterCard', 'Amex', 'Discover'], note: 'We do NOT accept Diners Club.' },
  'What are our hours of operation?': { type: 'single', text: 'Mon–Sat: 11:00am–10:00pm. Sun: 11:00am–9:00pm (or 8:00pm seasonal).' },
  'A Guest wants a $50 gift card, how do you fund it?': { type: 'single', text: 'Treat it like a cash transaction — process it immediately, don\'t hold the money in your pocket.' },
  'Where are employees allowed to smoke?': { type: 'single', text: 'Nowhere on property — non-smoking establishment, includes e-cigarettes.' },
  'What is the proper procedure when transferring shifts?': { type: 'single', text: 'Release and pick up the shift on HotSchedules — must be approved by a manager.' },
  'Explain the pivot point system and what it prevents.': { type: 'single', text: 'Seat 1 is the server\'s immediate left, numbered clockwise. Prevents "auctioning off" food to the table.' },
  'Where do we box to go food?': { type: 'single', text: 'At the table — bring the box to the guest and box it there. Never take food back to the kitchen to box it.' },
  'A Guest asks where the restroom is located, what do you do?': { type: 'single', text: 'Say "Absolutely, right this way" and walk them directly there — never just point.' },
  // Not in the flashcards yet: "Do we take reservations?", "Be Our Guest" cert vs. gift card, weekly specials/manager notes location.
}

export const PHASE3_ANSWERS = {
  'Daily soups (each day of the week) + garnishes': {
    type: 'checklist',
    items: [
      'Monday — Chicken Tortilla (garnish: Zebra cheese, tortilla strips)',
      'Tuesday — Creamy Chicken Noodle (garnish: parsley)',
      'Wednesday — Southwestern Bean (garnish: diced tomatoes)',
      'Thursday — Tomato Basil (garnish: parmesan, house croutons)',
      'Friday — New England Clam Chowder (garnish: parsley, oyster crackers)',
      'Saturday — Beef and Vegetable (garnish: Swiss cheese)',
      'Sunday — Moss Point Gumbo (garnish: seasoned rice, green onion)',
    ],
  },
  'All sides (14 sides)': {
    type: 'checklist',
    items: ['Angel hair pasta', 'Asparagus', 'Baked beans', 'Baked potato', 'Broccoli', 'Burgundy mushrooms', 'Cole slaw', 'French fries', 'Fried okra', 'Fruit', 'Garlic mashed potatoes', 'Seasoned rice', 'Sweet glazed carrots', 'Vegetable medley'],
  },
  'House salad ingredients': {
    type: 'checklist',
    items: ['Head lettuce', 'Romaine', 'Red/green cabbage', 'Carrots', 'Field greens', 'Croutons', 'Eggs', 'Bacon', 'Tomato'],
    note: 'No cucumber.',
  },
  'Chicken Club Salad': {
    type: 'checklist',
    items: ['Lightly fried chicken (added vs. house salad)', 'Avocado (added)', 'Green onions (added)', 'Dressing on the side (not tossed)'],
  },
  'Smoked Salmon Caesar Salad': {
    type: 'checklist',
    items: ['5oz short smoked salmon', 'Scallion aioli sauce', 'Tomato', 'Cucumber', 'Red onion', 'House-made croutons'],
  },
  "Walt's Champagne Chicken Salad": {
    type: 'checklist',
    items: ['Sunflower seeds', 'Strawberries', 'Spiced pecans', 'Pineapple', 'Feta cheese', 'Dates', 'Croutons', 'Cold grilled chicken', 'Champagne vinaigrette'],
  },
  'All dressings': {
    type: 'checklist',
    items: ['Honey Mustard', '1000 Island', 'Blue Cheese', 'Garlic', 'Herbal Vinaigrette', 'Ranch', 'Caesar', 'French', 'Oil & Vinegar', 'Champagne Vinaigrette'],
  },
  'Cheeseburger': {
    type: 'checklist',
    items: ['8oz beef patty', 'House-baked egg bun', 'Cheddar cheese', 'Mayonnaise', 'Lettuce', 'Tomato', 'Pickle', 'Diced onion'],
    note: 'Standard side: french fries.',
  },
  'Corned Beef': {
    type: 'checklist',
    items: ['5oz corned brisket', '4oz sauerkraut', 'Rye bread', 'Swiss cheese', '1000 Island dressing'],
  },
  'Chicken Avocado Club': {
    type: 'checklist',
    items: ['Blackened chicken breast', 'Avocado', 'Bacon', 'Tomato', 'Sprouts', 'Swiss cheese', 'Honey-mustard sauce', 'Wheat berry bread'],
  },
  'Famous French Dip': {
    type: 'checklist',
    items: ['8oz shaved prime rib', 'French roll', 'Mayo', 'Au jus'],
    note: 'Ask: creamy or raw horseradish?',
  },
  'Top Sirloin': { type: 'checklist', items: ['10oz center cut', 'Mashed potatoes', 'Choice of house or Caesar salad'] },
  'Filet': { type: 'checklist', items: ['7oz center cut', 'Mixed vegetable medley', 'Choice of house or Caesar salad'] },
  'Oven Roasted Chicken': { type: 'checklist', items: ['Half herb-rubbed chicken', 'Mashed potatoes', 'Baked beans'] },
  'Parmesan Crusted Chicken': {
    type: 'checklist',
    items: ['Two 3oz chicken breasts', 'Parmesan, walnut, and pecan crust', 'Topped with marinara sauce', 'Served on angel hair pasta', 'Pear tomato, mozzarella, red onion herbal salad'],
  },
  'Chicken Tender Platter': { type: 'checklist', items: ['9oz of chicken tenders', 'Hickory sauce and honey mustard', 'French fries and coleslaw'] },
  'Red Fish Tacos': {
    type: 'checklist',
    items: ['2 corn tortillas', '4oz blackened red fish', 'Coleslaw', 'Avocado aioli', 'Pickled red onions', 'Cilantro', 'Monterey Jack cheese', 'Rice and beans', '2 lime quarters'],
  },
  'Chicken Piccata': { type: 'checklist', items: ['Two 3oz chicken breasts', 'Artichokes, asparagus, grape tomatoes', 'Lemon caper butter sauce', 'Served over angel hair pasta'] },
  'Shrimp Scampi': { type: 'checklist', items: ['8 sautéed shrimp', 'Garlic, tomato, onion, parmesan, basil', 'Angel hair pasta', 'Parmesan cheese bread'] },
  'Chicken Fried Chicken': { type: 'checklist', items: ['Two hand-breaded 3oz chicken breasts', 'Black pepper chipotle gravy', 'Mashed potatoes', 'Sweet glazed carrots'] },
  'Grilled Pork Chops': { type: 'checklist', items: ['(2) 8oz pork chops', 'Cooked medium or well done', 'Mashed potatoes, baked beans'] },
  'Baby Back Ribs': { type: 'checklist', items: ['14–16oz full slab', 'French fries and baked beans'] },
  'Catfish Platter': { type: 'checklist', items: ['(3) 3–5oz catfish filets (9–15oz total)', 'Tartar sauce ramekin', 'French fries and coleslaw'] },
  'Short Smoked Salmon': { type: 'checklist', items: ['8oz salmon, short smoked', 'Whole grain mustard sauce', 'Cucumber relish', 'Vegetable medley', 'Choice of house or Caesar salad'] },
  "All Kid's Meals": { type: 'checklist', items: ['Beverage of their choice', 'Chocolate chip cookie with ice cream'], note: 'No age restrictions — anyone can order off the kids menu.' },
  // Not fillable: "Sell me two of your favorite starters" and the dessert pitch are subjective
  // sales prompts, not fixed answers. "Today's Fresh Fish" rotates daily by design.
}

export const PHASE4_ANSWERS = {
  'Name 2 bourbons': { type: 'checklist', items: ['Makers Mark', 'Crown Royal', 'Benchmark (House)'] },
  'Name 2 scotches': { type: 'checklist', items: ['Chivas', 'Dewars', 'Famous Grouse (House)'] },
  'Name 2 gins': { type: 'checklist', items: ['Hendricks', 'Bombay Sapphire', 'Beefeater (House)'] },
  'Name 2 vodkas': { type: 'checklist', items: ['Grey Goose', 'Ketel One', 'Deep Eddy (House)'] },
  'Name 2 tequilas': { type: 'checklist', items: ['Rancho Alegre (House)', 'Don Julio'] },
  'Describe the Perfect Margarita': {
    type: 'checklist',
    items: ['Rancho Alegre reposado tequila', 'Orange liqueur', 'Agave/lime mix', 'Served in a shaker'],
    note: 'Garnish: olive and lime.',
  },
  'How much wine do we pour per glass?': { type: 'single', text: '6oz standard pour.' },
  'What do you ask when a guest orders a martini?': { type: 'checklist', items: ['Gin or vodka?', 'Up or rocks?', 'Olive or twist?'] },
  'What is the garnish for clear liquors with a clear mixer?': { type: 'single', text: 'A lime squeeze (e.g. gin & tonic, vodka soda).' },
  'Name 4 things to look for on an ID': { type: 'checklist', items: ['Birth date', 'Photo', 'Expiration date', 'Government issued'] },
  'What kind of water do we serve?': { type: 'checklist', items: ['Tap (filtered)', 'Mountain Valley Spring', 'Mountain Valley Sparkling'] },
  'Describe the Peach Bellini': { type: 'checklist', items: ['Frozen peach puree', 'Peach schnapps', 'Rum', 'Champagne swirl'] },
  // Not fillable yet: draft/import/domestic beer name lists (the one draft-beer answer found
  // is hedged as "varies by location," not a fixed list), 2 rums (only the house rum is
  // confirmed), sweetest white / driest red wine, one after-dinner drink, "what sizes do
  // we offer" (question itself is ambiguous — worth clarifying what it's asking).
}
