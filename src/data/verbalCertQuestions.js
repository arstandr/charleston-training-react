/**
 * Verbal Certification — question banks and point values per phase.
 * Phase 1 is pass/fail (no numeric score). Numeric total: 20 + 100 + 62 + 30 = 212
 */

export const PHASE1_TRAINING = {
  questions: [
    'What did you think of your training?',
    'What are your short and long-term goals at Charleston\'s?',
    'What did you learn from your Follow Shift?',
    'What did you learn from your 3rd Reverse Shift?',
    'Who was your most effective Trainer?',
    'What did you struggle with the most?',
    'Do you feel that you have been trained well enough to be by yourself?',
    'What is your view on teamwork?',
  ],
}

export const PHASE2_LOCAL_OPTIONS = {
  maxScore: 20,
  questions: [
    'What is our phone number?',
    'What is our address?',
    'Who is the General Manager? Name our Managers.',
    'When is your schedule request due?',
    'Who writes your schedule?',
    'Where do you park?',
    'What is the proper way to answer the phone?',
    'How do you place someone on hold?',
    'Do we take checks? Traveler checks?',
    'What credit cards do we accept?',
    'What are our hours of operation?',
    'Do we take reservations?',
    'A Guest wants a $50 gift card, how do you fund it?',
    'Where are employees allowed to smoke?',
    'What is the difference between a "Be Our Guest" certificate and a gift card?',
    'What is the proper procedure when transferring shifts?',
    'Explain the pivot point system and what it prevents.',
    'Where do we box to go food?',
    'A Guest asks where the restroom is located, what do you do?',
    'Where do you find the weekly specials or manager\'s notes?',
  ],
}

/** Phase 3: categories and items; each item = 5 pts. Need 100 pts (20 items). */
export const PHASE3_FOOD_MENU = {
  targetScore: 100,
  pointsPerItem: 5,
  categories: [
    {
      title: 'Starters & soups',
      items: [
        'Sell me two of your favorite starters',
        'Daily soups (each day of the week) + garnishes',
      ],
    },
    {
      title: 'Sides & salads',
      items: [
        'All sides (14 sides)',
        'House salad ingredients',
        'Chicken Club Salad',
        'Smoked Salmon Caesar Salad',
        "Walt's Champagne Chicken Salad",
        'All dressings',
      ],
    },
    {
      title: 'Burgers & sandwiches',
      items: [
        'Cheeseburger',
        'Hickory Burger',
        'Corned Beef',
        'Chicken Avocado Club',
        'Famous French Dip',
      ],
    },
    {
      title: 'Entrees',
      items: [
        'Top Sirloin',
        'Filet',
        'Oven Roasted Chicken',
        'Parmesan Crusted Chicken',
        'Chicken Tender Platter',
        'Red Fish Tacos',
        'Chicken Piccata',
        'Shrimp Scampi',
        'Chicken Fried Chicken',
        'Grilled Pork Chops',
        'Baby Back Ribs',
        'Catfish Platter',
        'Short Smoked Salmon',
        "Today's Fresh Fish",
      ],
    },
    {
      title: 'Kid\'s & desserts',
      items: [
        'All Kid\'s Meals',
        'Desserts — sell me two favorites',
      ],
    },
  ],
}

/** Phase 4: each item has points; total 62 (10×2 + 14×3). */
export const PHASE4_BAR = {
  maxScore: 62,
  items: [
    { text: 'Name all draft beers', points: 2 },
    { text: 'Name all import beers', points: 2 },
    { text: 'Name all domestic beers', points: 2 },
    { text: 'Name 2 bourbons', points: 2 },
    { text: 'Name 2 scotches', points: 2 },
    { text: 'Name 2 gins', points: 2 },
    { text: 'Name 2 vodkas', points: 2 },
    { text: 'Name 2 rums', points: 2 },
    { text: 'Name 2 tequilas', points: 2 },
    { text: 'What is our sweetest white wine?', points: 2 },
    { text: 'What is our driest red wine?', points: 3 },
    { text: 'Describe the Bourbon Sour', points: 3 },
    { text: 'Describe the Perfect Margarita', points: 3 },
    { text: 'Describe the Bee\'s Knees', points: 3 },
    { text: 'Describe the Blackberry Mule', points: 3 },
    { text: 'How much wine do we pour per glass? (6 or 9 oz)', points: 3 },
    { text: 'What do you ask when a guest orders a martini?', points: 3 },
    { text: 'What is the garnish for clear liquors with a clear mixer?', points: 3 },
    { text: 'Name 4 things to look for on an ID', points: 3 },
    { text: 'Name one after-dinner drink', points: 3 },
    { text: 'What kind of water do we serve?', points: 3 },
    { text: 'Describe the Peach Bellini', points: 3 },
    { text: 'What sizes do we offer? (16 or 20 oz)', points: 3 },
    { text: 'Describe the Signature Margarita', points: 3 },
  ],
}

export const PHASE5_SERVICE = {
  maxScore: 30,
  questions: [
    'What is the maximum number of guests that can be rung up on one ticket?',
    'Your arms are full of dirty dishes and you realize a table has not been greeted, what do you do?',
    'How long do you have to greet a table?',
    'When is the best time to feature to a table? Why?',
    'Name the 7 Steps of Service',
    'How long do you have to get your first round of beverages to your table?',
    'Where should you handle non-stemmed glassware? Stemmed? At the bev area?',
    'All new beverages should go out with a ______?',
    'How do you refill waters and coffees?',
    'What should you do with the water pitcher or coffee carafe after topping off?',
    'Do we automatically serve straws in beverages?',
    'What is Tile Talk? How is it effective?',
    'What do you do if a guest\'s steak is undercooked?',
    'What do you do if a plate is delivered with the wrong side?',
    'What are the 4 R\'s?',
    'What is the check presentation at lunch called? Dinner?',
    'What is the 10-step rule?',
    'How do we carry plates?',
    'What is pre-bussing by seat?',
    'What is full hands in?',
    'What does a perfect pre-bus consist of?',
    'What do you always tell the server in front of you at the Hobart?',
    'What do you always ask the server behind you at the Hobart?',
    'What should you always do at the Hobart before turning & pulling?',
    'Should you only perform sidework at the beginning and end of the shift?',
    'Explain how you check out with a shift leader.',
    'Who is responsible for wiping & resetting tables?',
    'If there is no hot food or salads to run and you don\'t need anything for your section, how can you go out with full hands?',
    'You notice a guest has not entered the total amount correctly on their credit card, what do you do?',
    'Explain the cashout procedure in detail.',
  ],
}

/** Total possible points (phases 2–5 only; Phase 1 is pass/fail). */
export const TOTAL_POSSIBLE = 212
