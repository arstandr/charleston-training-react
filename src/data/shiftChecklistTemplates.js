/**
 * Charleston's Server Training Packet — Complete Digital Checklist Templates
 *
 * Source: Official Charleston's Server Training Manual (1_Char_Server_Packet.pdf)
 *
 * STRUCTURE PER SHIFT:
 * - shiftKey: matches the key used in shift assignments
 * - title: display name
 * - day: "Day 2", "Day 3", etc.
 * - subtitle: the italicized instruction from the manual
 * - test: which food/bar test is required this shift (or null)
 * - sections: array of checklist sections, each with items
 * - appraisalCategories: the performance appraisal items for this shift (1-3 scale)
 * - exercises: any special exercises for this shift (Practice Greet, Wine, Upselling)
 * - serviceReviewQuestions: spot-check questions for managers (if applicable)
 *
 * ITEM STRUCTURE:
 * { id: string, text: string, discuss: boolean }
 *   - discuss: true = BOLD item — trainer must actively discuss/teach this topic
 *   - discuss: false = regular item — trainer verifies/checks off
 */

// ============================================================
// SHARED: Uniform section used on ALL shifts
// ============================================================
const UNIFORM_SECTION = {
  id: 'uniform',
  title: 'Uniform Check',
  hasComments: true,
  items: [
    { id: 'hair', text: 'Hair (Females & Males)', discuss: false },
    { id: 'shirt', text: 'Shirt', discuss: false },
    { id: 'pants', text: 'Pants', discuss: false },
    { id: 'socks_shoes', text: 'Socks/Shoes', discuss: false },
    { id: 'jewelry', text: 'Jewelry', discuss: false },
    { id: 'cell_phone', text: 'Cell Phone Policy', discuss: false },
    { id: 'pouch_pens', text: 'Pouch/Pens/Bank', discuss: false },
    { id: 'server_book', text: 'Server Book & Order Pad', discuss: false },
  ],
};

// ============================================================
// SHARED: 7 Steps of Service (pre-filled for trainer reference)
// ============================================================
export const SEVEN_STEPS_OF_SERVICE = [
  '1. Greet the table',
  '2. Take the drink order',
  '3. Deliver drinks & take food order',
  '4. Deliver appetizers / salads / soups',
  '5. Entrée delivery & quality check',
  '6. Check back / check down / dessert offer',
  '7. Check presentation & farewell',
];

// ============================================================
// SHARED: Mission Statement
// ============================================================
export const MISSION_STATEMENT = "To Consistently Exceed Our Guests' Expectations";

// ============================================================
// DAY 2 — FOLLOW SHIFT
// ============================================================
export const followSections = {
  shiftKey: 'follow',
  title: 'Follow Shift',
  day: 'Day 2',
  subtitle:
    "Trainee has NO communication with Guests unless prompted. Trainee should be paying attention and absorbing the flow of service. Trainer & Trainee write all orders in order pad, compare and correct.",
  test: 'Food Test 1 - Starters, Soups & Salads, Burgers and Sandwiches',
  sections: [
    { ...UNIFORM_SECTION },
    {
      id: 'floor_basics',
      title: 'Floor Basics',
      subtitle: 'Before Trainer has a table',
      hasComments: true,
      items: [
        { id: 'f_pos', text: '15 minutes of POS Practice', discuss: false },
        { id: 'f_tour', text: 'Tour', discuss: false },
        { id: 'f_tables', text: 'Review – Table #s / Pivot Points (Cover Big Tops)', discuss: false },
        { id: 'f_weaving', text: 'Weaving', discuss: true },
        { id: 'f_greet_features', text: 'Review – Greet & Features', discuss: false },
        { id: 'f_right_of_way', text: 'Guest "Right of Way"', discuss: true },
        { id: 'f_buddy', text: 'Buddy System/Teamwork (Explain)', discuss: false },
        { id: 'f_in_out', text: 'In/Out Door', discuss: false },
        { id: 'f_turn_pull', text: 'Turn & Pull', discuss: true },
        { id: 'f_top3', text: 'Top 3 Priorities', discuss: true },
        { id: 'f_carrying', text: 'Carrying 3 Beverages in One Hand/Carrying Plates', discuss: false },
        { id: 'f_wine_roleplay', text: 'Role Play Wine Bottle Opening/Service', discuss: false },
        { id: 'f_sidework', text: 'Review – Side Work: (Opening, Running, & Closing)', discuss: false },
      ],
    },
    {
      id: 'table_service',
      title: 'Table Service',
      hasComments: true,
      items: [
        { id: 'f_greet_times', text: 'Greet Times / Team Greets', discuss: true },
        { id: 'f_buddy2', text: 'Buddy System / Teamwork', discuss: false },
        { id: 'f_hellos', text: '5 Hellos / 5 Goodbyes', discuss: false },
        { id: 'f_na_bev', text: '2-minute NA beverage service', discuss: true },
        { id: 'f_entree_front', text: 'Entrée in front of Guests', discuss: false },
        { id: 'f_manicuring', text: 'Manicuring', discuss: true },
        { id: 'f_reviewing', text: 'Reviewing orders', discuss: false },
        { id: 'f_order_accuracy', text: 'Order Pad Accuracy', discuss: true },
        { id: 'f_timing', text: 'Timing Courses', discuss: false },
        { id: 'f_wine_roleplay2', text: 'Role Play Wine Bottle Opening/Service', discuss: false },
        { id: 'f_anticipating', text: 'Anticipating Guest Needs', discuss: false },
        { id: 'f_pardon', text: 'Pardon My Reach', discuss: true },
        { id: 'f_silent', text: 'Silent Service', discuss: false },
        { id: 'f_tile_talk', text: 'Tile Talk', discuss: true },
      ],
    },
    {
      id: 'menu_review',
      title: 'Menu Knowledge Review',
      hasComments: true,
      items: [{ id: 'f_food_test2', text: 'Food Test 2 – Entrees, Sides, Kid Items & Desserts', discuss: false }],
    },
    {
      id: 'post_shift',
      title: 'Post-Shift',
      hasComments: true,
      items: [
        { id: 'f_pos_review', text: 'Review – POS', discuss: false },
        { id: 'f_practice_greet', text: 'Practice Greet', discuss: false, exerciseId: 'practiceGreet' },
        { id: 'f_cashout', text: 'Cash Out Procedures', discuss: false },
        { id: 'f_closing', text: 'Closing Duties', discuss: true },
        { id: 'f_condiments', text: 'Side Work: learning condiments', discuss: true },
        { id: 'f_checkout', text: 'Checkout with Shift Leader', discuss: false },
        { id: 'f_appraisal', text: 'Performance Appraisal with Manager', discuss: false },
      ],
    },
  ],
  appraisalCategories: [
    'Greet Times',
    'Beverage Service',
    'Sidework',
    'Running Food',
    'Weaving',
    'Perfect Pre-bus',
    'Sense of Urgency',
    'Personality/Attitude',
    'Teamwork',
    'Silent Service',
    'Tile Talk',
    'Timing Courses',
    'Uniform',
  ],
  appraisalNote: 'FOLLOW SHIFT (RATE YOUR TRAINER)',
  exercises: [
    {
      id: 'practice_greet',
      title: 'Practice Greet',
      instructions:
        "Following your Follow Shift, let's practice greeting the Manager and your Trainer. The Trainee should be able to verbally greet a table. Make sure all main points are hit and offer suggestions for improvement. Please notate the Manager who was greeted and any feedback.",
      trainerNote:
        "Use this page to help write out a sample greet including features so your Trainee can practice!",
      type: 'bullet_notes',
      requiresManagerSignature: true,
      requiresTrainerSignature: true,
    },
  ],
  serviceReviewQuestions: null,
};

// ============================================================
// DAY 3 — 1ST REVERSE SHIFT
// ============================================================
export const rev1Sections = {
  shiftKey: 'rev1',
  title: '1st Reverse Shift',
  day: 'Day 3',
  subtitle:
    "Trainee actively participates in service and interacts more with Guests depending on the Trainee's abilities. Trainer should take first table; Trainee takes the second. Make sure the Trainee handles one table in the Trainer's section the entire time.",
  test: 'Food Test 2 - Entrees, Sides, Kid Items & Desserts',
  sections: [
    { ...UNIFORM_SECTION },
    {
      id: 'setups_pos',
      title: 'Set-Ups & POS Practice',
      subtitle: 'Before Trainer has a table',
      hasComments: true,
      items: [
        { id: 'r1_pos', text: '15 minutes of POS Practice', discuss: false },
        { id: 'r1_greet_features', text: 'Review – Greet & Features', discuss: false },
        { id: 'r1_coffee', text: 'Coffee & Hot Tea Set-up', discuss: false },
        { id: 'r1_lemons', text: 'Side of Lemons', discuss: true },
        { id: 'r1_cracker', text: 'Cracker Bowl Set-up', discuss: true },
        { id: 'r1_pepper', text: 'Cracked Black Pepper', discuss: false },
        { id: 'r1_service_bar', text: 'Review – Service Bar & Running Drinks', discuss: false },
        { id: 'r1_sidework', text: 'Review – Side Work: (Opening, Running, & Closing)', discuss: false },
        { id: 'r1_wine_roleplay', text: 'Role Play Wine Bottle Opening/Service', discuss: false },
        { id: 'r1_dad', text: 'D.A.D. Words (Drinks/Appetizers/Desserts)', discuss: true },
        { id: 'r1_gift_card', text: 'Review – Funding a Gift Card', discuss: false },
      ],
    },
    {
      id: 'during_shift',
      title: 'During the Shift',
      hasComments: true,
      items: [
        { id: 'r1_pos_transactions', text: 'Trainee Starts Handling All P.O.S. Transactions', discuss: false },
        { id: 'r1_upselling', text: 'Up-Selling', discuss: false },
        { id: 'r1_host_stand', text: 'Host Stand – Assist Seating Tables', discuss: false },
        { id: 'r1_quality', text: 'Quality Checks', discuss: true },
        { id: 'r1_prebus', text: 'Perfect Pre-bus', discuss: true },
        { id: 'r1_30min', text: '30 Minute Guest Experience', discuss: false },
        { id: 'r1_check_back', text: 'Check Back / Check Down', discuss: false },
        { id: 'r1_check_ready', text: 'Check Ready & 10 Step Rule', discuss: false },
        { id: 'r1_restroom', text: 'Restroom Checks', discuss: true },
        { id: 'r1_wine_review', text: 'Review – Wine Service/Presentation', discuss: false },
        { id: 'r1_wine_roleplay2', text: 'Role Play Wine Bottle Opening/Service', discuss: false },
        { id: 'r1_last_name', text: 'Referring to Guests by their Last Name when Using a Credit Card', discuss: false },
        { id: 'r1_tile_talk', text: 'Tile Talk', discuss: true },
        { id: 'r1_togo', text: 'To-Go Bags & Procedure', discuss: false },
        { id: 'r1_red_check', text: "Red Check Procedure (4 R's)", discuss: true },
        { id: 'r1_guest_contract', text: 'Guest Contract', discuss: true },
      ],
    },
    {
      id: 'menu_review',
      title: 'Menu Knowledge Review',
      hasComments: true,
      items: [{ id: 'r1_bar_test', text: 'Bar, Liquor and Beer', discuss: false, linkedFlashcards: 'bar-beer' }],
    },
    {
      id: 'post_shift',
      title: 'Post-Shift',
      hasComments: true,
      items: [
        { id: 'r1_cashout', text: 'Cash Out Procedures', discuss: false },
        { id: 'r1_claiming', text: 'Claiming Tips', discuss: true },
        { id: 'r1_service_review', text: 'Service Review Topics', discuss: false, exerciseId: 'serviceReview_rev1' },
        { id: 'r1_closing', text: 'Closing Duties', discuss: false },
        { id: 'r1_tea_coffee', text: 'Side Work: Learning Tea and Coffee', discuss: true },
        { id: 'r1_checkout', text: 'Checkout with Shift Leader', discuss: true },
        { id: 'r1_appraisal', text: 'Performance Appraisal with Manager', discuss: false },
      ],
    },
  ],
  appraisalCategories: [
    'Greet Times',
    'Beverage Service',
    'Sidework',
    'Running Food',
    'Weaving',
    'Perfect Pre-bus',
    'Sense of Urgency',
    'Personality/Attitude',
    'Teamwork',
    'Check Presentation',
    'POS Knowledge',
    'Liquor Knowledge',
    'Uniform',
  ],
  appraisalNote: '1ST REVERSE SHIFT',
  exercises: null,
  serviceReviewQuestions: [
    'What is our maximum amount of time to greet a table?',
    'How do they know if a table has been greeted or not?',
    'What items do you cover in your greet?',
    'How do you use suggestive selling in your greet?',
    'How long do you have to get your first round of drinks to a table?',
    'When do you bring a new beverage to a Guest?',
    'All alcoholic beverages and hot beverages automatically receive what?',
    'Who has the "right of way" when moving about in Charleston\'s?',
    'How many "Hellos/Thank you\'s" should a Guest hear?',
    'If a Guest asks, "where is the restroom?" What do you do?',
  ],
};

// ============================================================
// DAY 4 — 2ND REVERSE SHIFT
// ============================================================
export const rev2Sections = {
  shiftKey: 'rev2',
  title: '2nd Reverse Shift',
  day: 'Day 4',
  subtitle:
    "Trainee actively participates in service and handles as many tables as they are comfortable handling. The goal is to have the Trainee acting independently by the completion of the shift. They should be trying to run 1-2 of the tables in the Trainer's section the entire shift.",
  test: 'Bar, Liquor & Beer',
  sections: [
    { ...UNIFORM_SECTION },
    {
      id: 'setups_pos',
      title: 'Set-Ups & POS Practice',
      subtitle: 'Before Trainer has a table',
      hasComments: true,
      items: [
        { id: 'r2_pos', text: '15 minutes of POS Practice', discuss: false },
        { id: 'r2_greet_features', text: 'Review – Greet & Features', discuss: false },
        { id: 'r2_manual_checks', text: 'Manual Checks', discuss: false },
        { id: 'r2_red_check', text: "Red Check Procedures (4R's)", discuss: true },
        { id: 'r2_host_stand', text: 'Host Stand – Assist Seating Tables', discuss: false },
        { id: 'r2_sidework', text: 'Side Work Review', discuss: false },
        { id: 'r2_tile_talk', text: 'Tile Talk', discuss: false },
        { id: 'r2_guest_in_restaurant', text: 'Review – When you are a Guest in the restaurant', discuss: false },
        { id: 'r2_tipping', text: 'Tipping on Employee Meals', discuss: true },
        { id: 'r2_wine_roleplay', text: 'Role Play Wine Bottle Opening/Service', discuss: false },
        { id: 'r2_phone', text: 'Review – Phone Answering Procedures', discuss: false },
        { id: 'r2_transfer', text: 'Review – Transferring Calls', discuss: false },
      ],
    },
    {
      id: 'during_shift',
      title: 'During the Shift',
      hasComments: true,
      items: [
        { id: 'r2_weaving', text: 'Weaving', discuss: false },
        { id: 'r2_full_hands', text: 'Full Hands In/Out', discuss: true },
        { id: 'r2_order_1st', text: 'Order on 1st Approach', discuss: false },
        { id: 'r2_consolidation', text: 'Consolidation - Give Examples', discuss: true },
        { id: 'r2_personality', text: 'Personality / Showmanship', discuss: false },
        { id: 'r2_wine_review', text: 'Review – Wine Service/Presentation', discuss: true },
        { id: 'r2_wine_roleplay2', text: 'Role Play Wine Bottle Opening/Service', discuss: false },
        { id: 'r2_expo', text: 'Expo – How to sell food', discuss: false },
        { id: 'r2_service_bar', text: 'Service Bar - Running Beverages', discuss: true },
        { id: 'r2_team_greets_treat', text: "Team Greets – Treat as though it's yours", discuss: true },
        { id: 'r2_team_greets_selling', text: 'Team Greets – Suggestive Selling & Featuring', discuss: true },
        { id: 'r2_team_greets_ringing', text: 'Team Greets – Ringing in Bar Drinks & Apps', discuss: true },
        { id: 'r2_team_greets_comm', text: 'Team Greets – Communication', discuss: true },
        { id: 'r2_zoning', text: 'Zoning', discuss: false },
      ],
    },
    {
      id: 'menu_review',
      title: 'Menu Knowledge Review',
      hasComments: true,
      items: [{ id: 'r2_wine_test', text: 'Wine & Wine Presentation', discuss: false, linkedExercise: 'wine_exercise_day4' }],
    },
    {
      id: 'post_shift',
      title: 'Post-Shift',
      hasComments: true,
      items: [
        { id: 'r2_cashout', text: 'Cash Out Procedures', discuss: false },
        { id: 'r2_wine_exercise', text: 'Wine Presentation Exercise', discuss: true, exerciseId: 'wineExercise' },
        { id: 'r2_wine_bottle', text: 'Wine Bottle Opening/Service Exercise', discuss: false, exerciseId: 'wineExercise' },
        { id: 'r2_closing', text: 'Closing Duties', discuss: false },
        { id: 'r2_lemons_restrooms', text: 'Side Work: Learning Lemons and Restrooms', discuss: true },
        { id: 'r2_checkout', text: 'Checkout with Shift Leader', discuss: false },
        { id: 'r2_comps', text: 'Comps & Voids', discuss: true },
        { id: 'r2_appraisal', text: 'Performance Appraisal with Manager', discuss: false },
      ],
    },
  ],
  appraisalCategories: [
    'Greet Times',
    'Beverage Service',
    'Sidework',
    'Running Food',
    'Weaving',
    'Perfect Pre-bus',
    'Sense of Urgency',
    'Team Greets',
    'Personality/Attitude',
    'Teamwork',
    'Full Hands In/Out',
    'Liquor Knowledge',
    'Uniform',
  ],
  appraisalNote: '2ND REVERSE SHIFT',
  exercises: [
    {
      id: 'wine_opening',
      title: 'Wine Bottle Opening/Service Exercise',
      instructions:
        'Please present and open a bottle of wine to your Manager and Trainer. Describe how to appropriately service a bottle of wine for a couple dining.',
      type: 'wine_checklist',
      wineItems: [
        'Presents wine bottle to Host',
        "3 V's (Vintage, Vineyard, Varietal)",
        'Opening bottle with wine key (Keeping label towards Host)',
        'Pours 1 oz. sample to Host',
        'Pours Ladies first',
        'Pours Host last',
        'Leaves wine glasses on table',
        'Using twist motion & linen for no spills',
        'Leaving wine in the bottle',
        'Red on linen, white in chiller',
        'Controlling the pour throughout the meal',
      ],
      hasWineBottleField: true,
      requiresManagerSignature: true,
      requiresTrainerSignature: true,
    },
  ],
  serviceReviewQuestions: null,
};

// ============================================================
// DAY 5 — 3RD REVERSE SHIFT
// ============================================================
export const rev3Sections = {
  shiftKey: 'rev3',
  title: '3rd Reverse Shift',
  day: 'Day 5',
  subtitle:
    'Sign off shift - Trainee should be able to run the section (2 tables minimum) from start to finish with little assistance from the Trainer. Trainer should be there to help if needed, but mostly just a shadow to the Trainee.',
  test: 'Wine 101',
  sections: [
    { ...UNIFORM_SECTION },
    {
      id: 'focus',
      title: 'Focus on the Following with the Trainee',
      hasComments: true,
      items: [
        { id: 'r3_greet_features', text: 'Review – Greet & Features', discuss: false },
        { id: 'r3_urgency', text: 'Sense of urgency', discuss: true },
        { id: 'r3_think_ahead', text: 'Ability to think ahead', discuss: false },
        { id: 'r3_consolidation', text: 'Consolidation / Anticipation', discuss: true },
        { id: 'r3_correcting', text: 'Correcting past behaviors', discuss: false },
        { id: 'r3_vision', text: 'Vision at table (Manicuring, Pre-bussing, etc.)', discuss: false },
        { id: 'r3_upselling', text: 'Upselling Exercise', discuss: true, exerciseId: 'upsellingExercise' },
        { id: 'r3_menu_knowledge', text: 'Menu, Liquor/Wine knowledge', discuss: false },
        { id: 'r3_order_accuracy', text: 'Summary Screen/Order Pad Accuracy', discuss: false },
        { id: 'r3_timing', text: 'Timing tables', discuss: true },
        { id: 'r3_attitude', text: 'Attitude/Personality', discuss: false },
        { id: 'r3_teamwork', text: 'Teamwork', discuss: false },
        { id: 'r3_wine_review', text: 'Review – Wine Service/Presentation', discuss: true },
        { id: 'r3_wine_roleplay', text: 'Role Play Wine Opening/Service', discuss: false },
        { id: 'r3_communication', text: 'Communication skills', discuss: false },
        { id: 'r3_carrying', text: 'Plate & Glassware carrying', discuss: false },
        { id: 'r3_bev_area', text: 'Beverage area procedures', discuss: false },
        { id: 'r3_turn_pull', text: 'Turning & Pulling procedures', discuss: true },
        { id: 'r3_expo', text: 'Offering hands to the Expo', discuss: false },
        { id: 'r3_service_bar', text: 'Running service bar drinks', discuss: false },
      ],
    },
    {
      id: 'menu_review',
      title: 'Menu Knowledge Review',
      hasComments: true,
      items: [{ id: 'r3_wine101', text: 'Wine 101', discuss: false }],
    },
    {
      id: 'post_shift',
      title: 'Post-Shift',
      hasComments: true,
      items: [
        { id: 'r3_cashout', text: 'Cash out procedures', discuss: true },
        { id: 'r3_upselling_exercise', text: 'Upselling Exercise', discuss: false, exerciseId: 'upsellingExercise' },
        { id: 'r3_service_review', text: 'Service Review Topics', discuss: false, exerciseId: 'serviceReview_rev4' },
        { id: 'r3_closing', text: 'Closing Duties', discuss: false },
        { id: 'r3_expo_ice_trash', text: 'Side work: Learning Expo and, Ice and Trash', discuss: true },
        { id: 'r3_checkout', text: 'Checkout with Shift Leader', discuss: false },
        { id: 'r3_appraisal', text: 'Performance Appraisal with Manager', discuss: false },
      ],
    },
  ],
  appraisalCategories: [
    'Greet Times',
    'Beverage Service',
    'Sidework',
    'Running Food',
    'Weaving',
    'Perfect Pre-bus',
    'Sense of Urgency',
    'Tile Talk',
    'Personality/Attitude',
    'Teamwork',
    'Upselling',
    'Liquor Knowledge',
    'Uniform',
  ],
  appraisalNote: '3RD REVERSE SHIFT',
  exercises: [
    {
      id: 'upselling_exercise',
      title: 'Upselling Exercise',
      instructions:
        'Upselling is the easiest way to increase your sales. Our goal as Servers is always to make the most amount of money in the least amount of time with the least amount of effort.',
      type: 'upselling_matching',
      questions: [
        {
          question: 'Guest orders vodka and tonic – upsell?',
          answer: "Grey Goose, Tito's, Belvedere, Absolut",
        },
        {
          question: 'A B C stands for what in upselling?',
          answer: "Angel's Envy, Basil Hayden, Woodford — premium bourbon upsells",
        },
        {
          question: 'When featuring, best way to increase sales?',
          answer: 'True (include wine pairing)',
        },
        {
          question: 'Guest orders dessert – upsell?',
          answer: 'Espresso Martini, Coffee, Chocolatini',
        },
        {
          question: 'Guest orders Manhattan/Old Fashioned – upsell?',
          answer: "Angel's Envy, Basil Hayden, Woodford",
        },
        {
          question: "Guest orders entrée without salad – ring in?",
          answer: 'House $/Caesar $',
        },
        {
          question: 'Guest orders burger – upsell extra?',
          answer: 'Burger Patty',
        },
        {
          question: 'Guest orders cup of soup – suggest for $1 more?',
          answer: 'Bowl of Soup',
        },
        {
          question: 'Prime Rib larger portions?',
          answer: '16oz, 18oz, 20oz, 22oz, etc.',
        },
      ],
    },
  ],
  serviceReviewQuestions: [
    'How often do we perform Restroom Checks?',
    'Where should your hand be when carrying glassware?',
    'How much ice goes in an iced tea?',
    'How much ice goes in a water or soda?',
    'Do we automatically serve straws with our waters, tea & sodas?',
    'Do we serve lemon with our waters?',
    "If a Guest asks for a side of lemons, what do you bring? Two Guests ask?",
    'What are our standard cook times for lunch? Dinner?',
    'What does manicure your table mean?',
    'What does a perfect pre-bus consist of?',
    'What is our Mission Statement?',
  ],
};

// ============================================================
// DAY 6 (EXTRA) — 4TH REVERSE SHIFT (IF NEEDED)
// ============================================================
export const rev4Sections = {
  shiftKey: 'rev4',
  title: '4th Reverse Shift',
  day: 'Extra',
  subtitle: 'Extra shift to fine tune the knowledge and skills of the Trainee.',
  test: null,
  sections: [
    { ...UNIFORM_SECTION },
    {
      id: 'focus',
      title: 'Focus on the following with the Trainee',
      hasComments: true,
      items: [
        { id: 'r4_greet_features', text: 'Review – Greet & Features', discuss: false },
        { id: 'r4_urgency', text: 'Sense of urgency', discuss: true },
        { id: 'r4_think_ahead', text: 'Ability to think ahead', discuss: false },
        { id: 'r4_consolidation', text: 'Consolidation / Anticipation', discuss: true },
        { id: 'r4_correcting', text: 'Correcting past behaviors', discuss: false },
        { id: 'r4_vision', text: 'Vision at table (Manicuring, Pre-bussing, etc.)', discuss: false },
        { id: 'r4_upselling', text: 'Upselling', discuss: true },
        { id: 'r4_menu_knowledge', text: 'Menu, Liquor/Wine knowledge', discuss: false },
        { id: 'r4_order_accuracy', text: 'Summary Screen/Order Pad Accuracy', discuss: false },
        { id: 'r4_timing', text: 'Timing tables', discuss: true },
        { id: 'r4_attitude', text: 'Attitude/Personality', discuss: false },
        { id: 'r4_teamwork', text: 'Teamwork', discuss: false },
        { id: 'r4_wine_review', text: 'Review – Wine Service/Presentation', discuss: true },
        { id: 'r4_communication', text: 'Communication skills', discuss: false },
        { id: 'r4_carrying', text: 'Plate & Glassware carrying', discuss: false },
        { id: 'r4_bev_area', text: 'Beverage area procedures', discuss: false },
        { id: 'r4_turn_pull', text: 'Turning & Pulling procedures', discuss: true },
        { id: 'r4_expo', text: 'Offering hands to the expo', discuss: false },
        { id: 'r4_service_bar', text: 'Running service bar drinks', discuss: false },
      ],
    },
    {
      id: 'menu_review',
      title: 'Menu Knowledge Review',
      hasComments: true,
      items: [
        { id: 'r4_wine_service', text: 'Wine Service & Wine presentation', discuss: false },
        { id: 'r4_service_standards', text: 'Service Standards', discuss: false },
      ],
    },
    {
      id: 'post_shift',
      title: 'Post-Shift',
      hasComments: true,
      items: [
        { id: 'r4_cashout', text: 'Cash out procedures', discuss: false },
        { id: 'r4_service_review', text: 'Service Review Topics', discuss: false, exerciseId: 'serviceReview_rev4' },
        { id: 'r4_closing', text: 'Closing duties & Side work', discuss: true },
        { id: 'r4_checkout', text: 'Checkout with Shift Leader', discuss: false },
        { id: 'r4_appraisal', text: 'Performance appraisal with Manager', discuss: false },
      ],
    },
  ],
  reminderNote: 'Remind the Trainee of the verbal certification',
  appraisalCategories: [
    'Greet Times',
    'Beverage Service',
    'Sidework',
    'Running Food',
    'Weaving',
    'Perfect Pre-bus',
    'Sense of Urgency',
    'Tile Talk',
    'Personality/Attitude',
    'Teamwork',
    'Upselling',
    'Liquor Knowledge',
    'Uniform',
  ],
  appraisalNote: '4TH REVERSE SHIFT',
  appraisalSignOffNote: 'SIGNING BELOW MEANS ALL PARTIES AGREE THE TRAINEE IS READY FOR A 2 TABLE SECTION SOLO',
  exercises: null,
  serviceReviewQuestions: null,
};

// ============================================================
// DAY 6 — SERVER ASSISTANT (SA) / FOOD RUN SHIFT
// ============================================================
export const foodrunSections = {
  shiftKey: 'foodrun',
  title: 'Server Assistant (SA) Shift',
  day: 'Day 6',
  subtitle:
    'This shift the Trainee will run food, drinks & assist the staff. It is a great opportunity to review table numbers, seat numbers, the flow of the shift & the expo window.',
  test: 'Wine 101',
  sections: [
    { ...UNIFORM_SECTION },
    {
      id: 'trainee_focus',
      title: 'Trainee will focus on the following',
      hasComments: true,
      items: [
        { id: 'sa_hot_food', text: 'Hot food window', discuss: false },
        { id: 'sa_salad', text: 'Salad window', discuss: false },
        { id: 'sa_wiping', text: 'Wiping plates', discuss: false },
        { id: 'sa_additions', text: 'Additions to plates: Ketchup, Au jus, etc.', discuss: false },
        { id: 'sa_running_food', text: 'Running hot food', discuss: false },
        { id: 'sa_running_drinks', text: 'Running cold drinks', discuss: false },
        { id: 'sa_flow', text: 'Flow of the shift', discuss: false },
        { id: 'sa_tile_talk', text: 'Tile Talk', discuss: false },
        { id: 'sa_table_nums', text: 'Table numbers', discuss: false },
        { id: 'sa_togo', text: 'Packaging togo orders', discuss: false },
        { id: 'sa_seat_nums', text: 'Seat numbers (Pivot Points)', discuss: false },
        { id: 'sa_service_bar', text: 'Service bar - Drink running', discuss: false },
        { id: 'sa_entree_closest', text: 'Entrée closest to Guest', discuss: false },
        {
          id: 'sa_ice',
          text: 'Ice in drinks - Iced tea overflowing with ice | Soda & Water full of ice',
          discuss: false,
        },
        { id: 'sa_full_hands', text: 'Full hands in/out', discuss: false },
        { id: 'sa_in_out_door', text: 'In/Out door', discuss: false },
      ],
    },
  ],
  reminderNote:
    "Remind the Trainee to look forward into their training & tests online. Also, remind them of the verbal certification.",
  appraisalCategories: null,
  appraisalNote: null,
  exercises: null,
  serviceReviewQuestions: null,
};

// ============================================================
// DAY 7 — CERTIFICATION
// ============================================================
export const certSections = {
  shiftKey: 'cert',
  title: 'Server Certification',
  day: 'Day 7',
  subtitle:
    'Final certification. Trainee demonstrates mastery of all training topics through verbal assessment with management.',
  test: null,
  sections: [
    { ...UNIFORM_SECTION },
    {
      id: 'cert_exercises',
      title: 'Certification Exercises',
      hasComments: false,
      items: [
        { id: 'cert_wine', text: 'Wine Bottle Presentation Exercise', discuss: false, linkedExercise: 'wine_exercise_cert' },
      ],
    },
  ],
  appraisalCategories: null,
  appraisalNote: null,
  exercises: [
    {
      id: 'wine_presentation_final',
      title: 'Wine Bottle Presentation Exercise',
      instructions:
        'Please open a bottle of wine for your Manager. Describe how to appropriately pour wine for a couple dining.',
      type: 'wine_checklist',
      wineItems: [
        'Presents wine bottle to Host',
        "3 V's (Vintage, Vineyard, Varietal)",
        'Opening bottle that has been half corked by Bartender (Keeping label towards Host)',
        'Pours 1 oz. sample to Host',
        'Pours Ladies first',
        'Pours Host last',
        'Leaves wine glasses on table',
        'Using twist motion & linen for no spills',
        'Leaving wine in the bottle',
        'Red on linen, white in chiller',
        'Controlling the pour throughout the meal',
      ],
      hasWineBottleField: true,
      requiresManagerSignature: true,
    },
  ],
  serviceReviewQuestions: null,
};

// ============================================================
// LOOKUP MAP — used by ShiftDetailPage to load the right template
// ============================================================
export const SHIFT_TEMPLATES = {
  follow: followSections,
  rev1: rev1Sections,
  rev2: rev2Sections,
  rev3: rev3Sections,
  rev4: rev4Sections,
  foodrun: foodrunSections,
  cert: certSections,
};

// ============================================================
// SHIFT_TYPES — display metadata for shift cards (keep for compatibility)
// ============================================================
export const SHIFT_TYPES = {
  follow: {
    key: 'follow',
    label: 'Follow shift',
    icon: '👣',
    dayLabel: 'Day 2',
    description: "Trainee observes experienced server. No guest communication unless prompted.",
    linkedTest: 'starters-soups-salads',
  },
  rev1: {
    key: 'rev1',
    label: '1st Reverse',
    icon: '🔄',
    dayLabel: 'Day 3',
    description: "Trainee handles one table in trainer's section.",
    linkedTest: 'entrees-sides-desserts',
  },
  rev2: {
    key: 'rev2',
    label: '2nd Reverse',
    icon: '🔄',
    dayLabel: 'Day 4',
    description: 'Trainee handles two tables minimum.',
    linkedTest: 'bar-liquor-beer',
  },
  rev3: {
    key: 'rev3',
    label: '3rd Reverse',
    icon: '🔄',
    dayLabel: 'Day 5',
    description: 'Trainee runs section independently.',
    linkedTest: 'wine-101',
  },
  rev4: {
    key: 'rev4',
    label: '4th Reverse',
    icon: '🔄',
    dayLabel: 'Day 6',
    description: 'Fine-tune skills. Extra practice shift.',
    linkedTest: 'wine-service',
  },
  foodrun: {
    key: 'foodrun',
    label: 'Food Run',
    icon: '🍽️',
    dayLabel: 'Day 7',
    description: 'Run food on busy Friday/Saturday night.',
    linkedTest: 'wine-test',
  },
  cert: {
    key: 'cert',
    label: 'Certification',
    icon: '🎓',
    dayLabel: 'Final',
    description: 'Verbal certification exam.',
    linkedTest: null,
  },
};

// Alias for backward compatibility
export const TRAINING_MISSION_STATEMENT = MISSION_STATEMENT

/**
 * Maps each training day's test to the flashcard set IDs for practice tests.
 * Set IDs must match Firestore flashcards or flashcardDatabase.js.
 */
/** quizTestId: ID used in QuizzesPage (QUIZ_DATABASE). null = merge from all sets. */
export const TEST_TO_SETS = {
  food_test_1: {
    title: 'Food Test 1',
    subtitle: 'Starters, Soups & Salads, Burgers and Sandwiches',
    setIds: ['starters-soups-salads'],
    forShifts: ['follow'],
    quizTestId: 'soups_test',
  },
  food_test_2: {
    title: 'Food Test 2',
    subtitle: 'Entrees, Sides, Kid Items & Desserts',
    setIds: ['steaks-specialties'],
    forShifts: ['rev1'],
    quizTestId: 'steaks_test',
  },
  bar_test: {
    title: 'Bar, Liquor & Beer',
    subtitle: 'Bar & Beer Knowledge',
    setIds: ['bar-beer'],
    forShifts: ['rev2'],
    quizTestId: 'bar_test',
  },
  wine_test: {
    title: 'Wine 101',
    subtitle: 'Wine & Cocktail Knowledge',
    setIds: ['wines-cocktails'],
    forShifts: ['rev3', 'foodrun'],
    quizTestId: 'wines_test',
  },
  verbal_cert: {
    title: 'Verbal Certification',
    subtitle: 'All menu and service knowledge',
    setIds: ['ALL'],
    forShifts: ['cert'],
    quizTestId: null, // Merges from all sets
  },
}

export function getTestForShift(shiftKey) {
  return Object.values(TEST_TO_SETS).find((t) => t.forShifts.includes(shiftKey)) || null
}

/** Returns IDs of required (bold) checklist items for a shift — those with discuss:true. */
export function getRequiredItemIds(shiftKey) {
  const template = SHIFT_TEMPLATES[shiftKey]
  if (!template?.sections) return []
  const ids = []
  for (const section of template.sections) {
    for (const item of section.items || []) {
      if (item.discuss === true && item.id) ids.push(item.id)
    }
  }
  return ids
}

/**
 * Get checklist template for ShiftChecklist component (legacy format with label/type).
 */
export function getShiftChecklistTemplate(shiftKey) {
  const t = SHIFT_TEMPLATES[shiftKey];
  if (!t) return null;
  return {
    ...t,
    missionStatement: MISSION_STATEMENT,
    sections: (t.sections || []).map((s) => ({
      ...s,
      id: s.id ?? s.title?.toLowerCase().replace(/\s+/g, '_'),
      help: s.help ?? s.subtitle ?? s.description,
      items: (s.items || []).map((i) => ({
        ...i,
        label: i.text ?? i.label,
        type: i.type ?? 'checkbox',
      })),
    })),
  };
}

/**
 * Exercise definitions — maps exerciseId keys to their config.
 * Used by ChecklistSections and ShiftDetailPage to render inline slide-down panels.
 */
export const EXERCISE_DEFINITIONS = {
  practiceGreet: {
    id: 'practiceGreet',
    title: 'Practice Greet',
    subtitle: 'Day 2 — Follow Shift',
    icon: '👋',
    component: 'PracticeGreetExercise',
  },
  serviceReview_rev1: {
    id: 'serviceReview_rev1',
    title: 'Service Review Topics',
    subtitle: 'Day 3 — 1st Reverse',
    icon: '📋',
    component: 'ServiceReviewExercise',
    questions: [
      'What is our maximum amount of time to greet a table?',
      'How do they know if a table has been greeted or not?',
      'What items do you cover in your greet?',
      'How do you use suggestive selling in your greet?',
      'How long do you have to get your first round of drinks to a table?',
      'When do you bring a new beverage to a Guest?',
      'All alcoholic beverages and hot beverages automatically receive what?',
      'Who has the "right of way" when moving about in Charleston\'s?',
      'How many "Hellos/Thank you\'s" should a Guest hear?',
      'If a Guest asks, "where is the restroom?" What do you do?',
    ],
  },
  wineExercise: {
    id: 'wineExercise',
    title: 'Wine Bottle Opening & Service',
    subtitle: 'Day 4 — 2nd Reverse',
    icon: '🍷',
    component: 'WineExercise',
    variant: 'day4',
  },
  wine_exercise_cert: {
    id: 'wine_exercise_cert',
    title: 'Wine Bottle Presentation',
    subtitle: 'Certification',
    icon: '🍷',
    component: 'WineExercise',
    variant: 'cert',
  },
  upsellingExercise: {
    id: 'upsellingExercise',
    title: 'Upselling Exercise',
    subtitle: 'Day 5 — 3rd Reverse',
    icon: '💰',
    component: 'UpsellingExercise',
  },
  serviceReview_rev4: {
    id: 'serviceReview_rev4',
    title: 'Service Review Topics',
    subtitle: 'Day 6 — 4th Reverse',
    icon: '📋',
    component: 'ServiceReviewExercise',
    questions: [
      'How often do we perform Restroom Checks?',
      'Where should your hand be when carrying glassware?',
      'How much ice goes in an iced tea?',
      'How much ice goes in a water or soda?',
      'Do we automatically serve straws with our waters, tea & sodas?',
      'Do we serve lemon with our waters?',
      "If a Guest asks for a side of lemons, what do you bring? Two Guests ask?",
      'What are our standard cook times for lunch? Dinner?',
      'What does manicure your table mean?',
      'What does a perfect pre-bus consist of?',
      'What is our Mission Statement?',
    ],
  },
};

export default SHIFT_TEMPLATES;
