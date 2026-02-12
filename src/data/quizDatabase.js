// Extracted from public/index.html - Practice Test / Official Test Database
export const QUIZ_DATABASE = {
  "bar_test": {
    "id": "bar_test",
    "title": "Bar & Beer Knowledge - Final Test",
    "passing_score": 85,
    "questions": [
      {
        "q": "Which beers are DOMESTIC?",
        "opts": [
          "Bud Light, Coors Light, Miller Lite, Michelob Ultra, Budweiser",
          "Heineken, Corona, Stella Artois, Guinness",
          "Bud Light, Corona, Heineken",
          "All of the above"
        ],
        "ans": 0,
        "exp": "Domestic beers: Bud Light, Coors Light, Michelob Ultra, Budweiser, Miller Lite"
      },
      {
        "q": "Which beers are IMPORT?",
        "opts": [
          "Miller Lite, Coors Light",
          "Corona, Guinness, Heineken, Stella Artois",
          "Bud Light, Budweiser",
          "Michelob Ultra"
        ],
        "ans": 1,
        "exp": "Import beers: Corona, Guinness, Heineken, Stella Artois"
      },
      {
        "q": "Is a frozen glass served with every beer?",
        "opts": [
          "True",
          "False - only with draft",
          "False - only upon request",
          "False - only with imports"
        ],
        "ans": 0,
        "exp": "TRUE - frozen glass served with every beer (draft and bottle)"
      },
      {
        "q": "What are our draft beer sizes?",
        "opts": [
          "12oz and 16oz",
          "16oz and 20oz",
          "16oz and 24oz",
          "20oz and 24oz"
        ],
        "ans": 1,
        "exp": "We serve 16oz and 20oz draft beers"
      },
      {
        "q": "Which are BOURBONS?",
        "opts": [
          "Crown Royal and Makers Mark",
          "Chivas and Dewars",
          "Absolut and Ketel One",
          "Captain Morgan and Malibu"
        ],
        "ans": 0,
        "exp": "Bourbons: Crown Royal, Makers Mark"
      },
      {
        "q": "Which are SCOTCH?",
        "opts": [
          "Crown Royal and Makers Mark",
          "Chivas and Dewars",
          "Hendricks and Bombay Sapphire",
          "Don Julio and Patron Silver"
        ],
        "ans": 1,
        "exp": "Scotch: Chivas, Dewars"
      },
      {
        "q": "Which are GIN?",
        "opts": [
          "Absolut and Ketel One",
          "Crown Royal and Makers Mark",
          "Hendricks and Bombay Sapphire",
          "Captain Morgan and Malibu"
        ],
        "ans": 2,
        "exp": "Gin: Hendricks, Bombay Sapphire"
      },
      {
        "q": "Which are VODKA?",
        "opts": [
          "Absolut and Ketel One",
          "Hendricks and Bombay",
          "Crown Royal and Makers Mark",
          "Captain Morgan and Malibu"
        ],
        "ans": 0,
        "exp": "Vodka: Absolut, Ketel One"
      },
      {
        "q": "Which are RUM?",
        "opts": [
          "Don Julio and Patron",
          "Absolut and Ketel One",
          "Captain Morgan and Malibu",
          "Chivas and Dewars"
        ],
        "ans": 2,
        "exp": "Rum: Captain Morgan, Malibu"
      },
      {
        "q": "Which are TEQUILA?",
        "opts": [
          "Don Julio and Patron Silver",
          "Crown Royal and Makers Mark",
          "Captain Morgan and Malibu",
          "Absolut and Ketel One"
        ],
        "ans": 0,
        "exp": "Tequila: Don Julio, Patron Silver"
      },
      {
        "q": "What is HOUSE bourbon?",
        "opts": [
          "Crown Royal",
          "Makers Mark",
          "Benchmark No. 8",
          "Jim Beam"
        ],
        "ans": 2,
        "exp": "Benchmark No. 8 is house bourbon"
      },
      {
        "q": "What is HOUSE scotch?",
        "opts": [
          "Chivas",
          "Dewars",
          "Famous Grouse",
          "Johnnie Walker"
        ],
        "ans": 2,
        "exp": "Famous Grouse is house scotch"
      },
      {
        "q": "What is HOUSE gin?",
        "opts": [
          "Bombay Sapphire",
          "Hendricks",
          "Beefeaters",
          "Tanqueray"
        ],
        "ans": 2,
        "exp": "Beefeaters is house gin"
      },
      {
        "q": "What is HOUSE vodka?",
        "opts": [
          "Absolut",
          "Ketel One",
          "Grey Goose",
          "Deep Eddys"
        ],
        "ans": 3,
        "exp": "Deep Eddys is house vodka"
      },
      {
        "q": "What is HOUSE rum?",
        "opts": [
          "Captain Morgan",
          "Malibu",
          "Don Q",
          "Bacardi"
        ],
        "ans": 2,
        "exp": "Don Q is house rum"
      },
      {
        "q": "What is HOUSE tequila?",
        "opts": [
          "Don Julio",
          "Patron",
          "Rancho Alegre",
          "Jose Cuervo"
        ],
        "ans": 2,
        "exp": "Rancho Alegre is house tequila"
      },
      {
        "q": "What is garnish for sours and collins drinks?",
        "opts": [
          "Lemon wedge",
          "Lime wheel",
          "Orange flag",
          "Cherry"
        ],
        "ans": 2,
        "exp": "Orange flag garnish for all sours and collins drinks"
      },
      {
        "q": "Who should you card?",
        "opts": [
          "Anyone under 21",
          "Anyone that looks 30 or younger",
          "Anyone that looks 40 or younger",
          "Anyone that looks 50 or younger"
        ],
        "ans": 2,
        "exp": "Card anyone that looks 40 or younger"
      },
      {
        "q": "What ID do we accept?",
        "opts": [
          "Any photo ID",
          "Drivers license only",
          "Government issued ID with photo and expiration date",
          "Passport only"
        ],
        "ans": 2,
        "exp": "We accept government issued ID with photo and expiration date"
      },
      {
        "q": "If guest seems intoxicated, should YOU cut them off?",
        "opts": [
          "True - cut them off immediately",
          "False - let manager know",
          "True but tell manager after",
          "Depends on situation"
        ],
        "ans": 1,
        "exp": "FALSE - Never cut off guest yourself. Let manager know immediately and they will handle it"
      },
      {
        "q": "Alert manager after how many drinks?",
        "opts": [
          "2 drinks",
          "3 drinks",
          "4 drinks",
          "5 drinks"
        ],
        "ans": 1,
        "exp": "Alert manager after guest has 3 drinks"
      },
      {
        "q": "Which juices do we fresh squeeze?",
        "opts": [
          "Orange only",
          "Lemon and lime",
          "Orange and grapefruit",
          "All juices"
        ],
        "ans": 2,
        "exp": "We fresh squeeze orange and grapefruit juices in house"
      },
      {
        "q": "Do we make our own bloody mary mix?",
        "opts": [
          "True",
          "False"
        ],
        "ans": 0,
        "exp": "TRUE - we make our own bloody mary mix in house"
      },
      {
        "q": "What sparkling water do we serve?",
        "opts": [
          "Perrier",
          "San Pellegrino",
          "The Mountain Valley",
          "Topo Chico"
        ],
        "ans": 2,
        "exp": "We serve The Mountain Valley sparkling water"
      },
      {
        "q": "Do we serve espresso and cappuccino?",
        "opts": [
          "True",
          "False - no espresso drinks",
          "Only espresso",
          "Only cappuccino"
        ],
        "ans": 1,
        "exp": "FALSE - we do NOT serve espresso or cappuccino"
      },
      {
        "q": "How much liquor in UP, ON ROCKS, or NEAT orders?",
        "opts": [
          "1oz",
          "1.5oz",
          "2oz",
          "2.5oz"
        ],
        "ans": 2,
        "exp": "2oz liquor pour for UP, ON ROCKS, or NEAT (slightly larger pour than standard 1.5oz)"
      },
      {
        "q": "What does UP mean?",
        "opts": [
          "On ice",
          "Shaken through ice then strained",
          "Room temperature",
          "With soda"
        ],
        "ans": 1,
        "exp": "UP means shaken through ice then strained into glass (chilled but no ice in glass)"
      },
      {
        "q": "What does NEAT mean?",
        "opts": [
          "On ice",
          "Shaken with ice",
          "Room temperature, no ice",
          "With water"
        ],
        "ans": 2,
        "exp": "NEAT means room temperature liquor with no ice"
      },
      {
        "q": "What does ON THE ROCKS mean?",
        "opts": [
          "Shaken with ice",
          "Poured over ice",
          "No ice",
          "Blended with ice"
        ],
        "ans": 1,
        "exp": "ON THE ROCKS means poured over ice cubes"
      },
      {
        "q": "What type of liquor is Crown Royal?",
        "opts": [
          "Scotch",
          "Bourbon",
          "Whiskey",
          "Canadian Whisky"
        ],
        "ans": 1,
        "exp": "Crown Royal is classified as bourbon in our system"
      },
      {
        "q": "Heineken appears in which category?",
        "opts": [
          "Domestic",
          "Import",
          "Both",
          "Neither"
        ],
        "ans": 1,
        "exp": "Heineken is import beer"
      }
    ]
  },
  "wines_test": {
    "id": "wines_test",
    "title": "Wine & Cocktail Knowledge - Final Test",
    "passing_score": 85,
    "questions": [
      {
        "q": "What type of white wine is J Lohr Riverstone?",
        "opts": [
          "Sauvignon Blanc",
          "Pinot Grigio",
          "Chardonnay",
          "Riesling"
        ],
        "ans": 2,
        "exp": "J Lohr Riverstone is Chardonnay from Monterey"
      },
      {
        "q": "What type is Moselland Castle?",
        "opts": [
          "Chardonnay",
          "Riesling",
          "Pinot Grigio",
          "Moscato"
        ],
        "ans": 1,
        "exp": "Moselland Castle is Riesling from Germany"
      },
      {
        "q": "What type is Dipinti?",
        "opts": [
          "Chardonnay",
          "Riesling",
          "Pinot Grigio",
          "Moscato"
        ],
        "ans": 2,
        "exp": "Dipinti is Pinot Grigio"
      },
      {
        "q": "What type is Bricco Riella?",
        "opts": [
          "Chardonnay",
          "Prosecco",
          "Moscato",
          "Sauvignon Blanc"
        ],
        "ans": 2,
        "exp": "Bricco Riella is Moscato (sweet)"
      },
      {
        "q": "What type is Charles Krug?",
        "opts": [
          "Chardonnay",
          "Sauvignon Blanc",
          "Pinot Grigio",
          "Riesling"
        ],
        "ans": 0,
        "exp": "Charles Krug is Chardonnay"
      },
      {
        "q": "What type is Maschio?",
        "opts": [
          "Moscato",
          "Prosecco",
          "Chardonnay",
          "Pinot Grigio"
        ],
        "ans": 1,
        "exp": "Maschio is Prosecco"
      },
      {
        "q": "Where is Sonoma Cutrer from?",
        "opts": [
          "Napa Valley",
          "Russian River Valley",
          "Sonoma Valley",
          "Monterey"
        ],
        "ans": 1,
        "exp": "Sonoma Cutrer Chardonnay is from Russian River Valley"
      },
      {
        "q": "Which Chardonnay is bottle only (no glass)?",
        "opts": [
          "J Lohr Riverstone",
          "Sonoma Cutrer",
          "Cakebread Cellars",
          "Charles Krug"
        ],
        "ans": 2,
        "exp": "Cakebread Cellars Chardonnay is bottle only"
      },
      {
        "q": "Which white wine is SWEET?",
        "opts": [
          "J Lohr Riverstone",
          "Bricco Riella Moscato",
          "Charles Krug",
          "Dipinti"
        ],
        "ans": 1,
        "exp": "Bricco Riella Moscato is sweet"
      },
      {
        "q": "What type is Marlborough Estate from New Zealand?",
        "opts": [
          "Chardonnay",
          "Pinot Grigio",
          "Sauvignon Blanc",
          "Riesling"
        ],
        "ans": 2,
        "exp": "Marlborough Estate is Sauvignon Blanc from New Zealand"
      },
      {
        "q": "What type is Josh Cellars?",
        "opts": [
          "Pinot Noir",
          "Merlot",
          "Cabernet Sauvignon",
          "Malbec"
        ],
        "ans": 2,
        "exp": "Josh Cellars is Cabernet Sauvignon"
      },
      {
        "q": "What type is Meiomi?",
        "opts": [
          "Cabernet",
          "Pinot Noir",
          "Merlot",
          "Malbec"
        ],
        "ans": 1,
        "exp": "Meiomi is Pinot Noir from California"
      },
      {
        "q": "What type is Catena?",
        "opts": [
          "Cabernet",
          "Pinot Noir",
          "Merlot",
          "Malbec"
        ],
        "ans": 3,
        "exp": "Catena is Malbec from Argentina"
      },
      {
        "q": "What type is Golden Eye?",
        "opts": [
          "Cabernet",
          "Pinot Noir",
          "Merlot",
          "Malbec"
        ],
        "ans": 1,
        "exp": "Golden Eye is Pinot Noir"
      },
      {
        "q": "What type is Happy Camper?",
        "opts": [
          "Cabernet",
          "Pinot Noir",
          "Merlot",
          "Red Blend"
        ],
        "ans": 3,
        "exp": "Happy Camper is Red Blend"
      },
      {
        "q": "What type is The Prisoner?",
        "opts": [
          "Cabernet",
          "Pinot Noir",
          "Merlot",
          "Red Blend"
        ],
        "ans": 3,
        "exp": "The Prisoner is Red Blend"
      },
      {
        "q": "What type is Ghost Runner?",
        "opts": [
          "Cabernet",
          "Pinot Noir",
          "Merlot",
          "Red Blend"
        ],
        "ans": 3,
        "exp": "Ghost Runner is Red Blend"
      },
      {
        "q": "What type is Bonanza?",
        "opts": [
          "Cabernet Sauvignon",
          "Pinot Noir",
          "Merlot",
          "Red Blend"
        ],
        "ans": 0,
        "exp": "Bonanza is Cabernet Sauvignon"
      },
      {
        "q": "Josh Cellars Cabernet pairs with?",
        "opts": [
          "White protein (chicken, fish)",
          "Red protein (beef, lamb)",
          "Desserts",
          "Appetizers"
        ],
        "ans": 1,
        "exp": "Josh Cellars Cabernet Sauvignon pairs with red proteins"
      },
      {
        "q": "Charles Krug Chardonnay pairs with?",
        "opts": [
          "White protein (chicken, fish)",
          "Red protein (beef, lamb)",
          "Desserts",
          "Spicy food"
        ],
        "ans": 0,
        "exp": "Charles Krug Chardonnay pairs with white proteins"
      },
      {
        "q": "Meiomi Pinot Noir pairs with?",
        "opts": [
          "White protein",
          "Red protein",
          "Seafood",
          "Desserts"
        ],
        "ans": 1,
        "exp": "Meiomi Pinot Noir pairs with red proteins"
      },
      {
        "q": "Where is The Prisoner from?",
        "opts": [
          "Columbia Valley WA",
          "Burgundy France",
          "Napa Valley California",
          "Sonoma California"
        ],
        "ans": 2,
        "exp": "The Prisoner is from Napa Valley, California"
      },
      {
        "q": "Where is Kiona from?",
        "opts": [
          "Columbia Valley WA",
          "Napa Valley CA",
          "Sonoma CA",
          "Willamette Valley OR"
        ],
        "ans": 0,
        "exp": "Kiona is from Columbia Valley, Washington"
      },
      {
        "q": "Where is Joseph Drouhin Macon-Villages from?",
        "opts": [
          "Napa Valley CA",
          "Burgundy France",
          "Bordeaux France",
          "Tuscany Italy"
        ],
        "ans": 1,
        "exp": "Joseph Drouhin Macon-Villages is from Burgundy, France"
      },
      {
        "q": "What vodka in Espresso Martini?",
        "opts": [
          "Deep Eddys",
          "Absolut Vanilla",
          "Pearl Vanilla Vodka",
          "Ketel One"
        ],
        "ans": 2,
        "exp": "Espresso Martini: Pearl Vanilla Vodka, heavy cream and espresso"
      },
      {
        "q": "What in Lemon Drop Martini?",
        "opts": [
          "Vodka, lemon, simple syrup only",
          "Deep Eddys lemon vodka, Cointreau, lemon juice, simple syrup, sugar rim",
          "Gin, lemon, sugar rim",
          "Vodka, triple sec, lemon"
        ],
        "ans": 1,
        "exp": "Lemon Drop: Deep Eddys lemon vodka, Cointreau, lemon juice, simple syrup, sugar rim"
      },
      {
        "q": "What tequila in Perfect Margarita?",
        "opts": [
          "Don Julio reposado",
          "Patron Silver",
          "Rancho Alegre reposado",
          "Jose Cuervo"
        ],
        "ans": 2,
        "exp": "Perfect Margarita: Rancho Alegre reposado tequila, orange liqueur, margarita mix in shaker"
      },
      {
        "q": "What bourbon in Paper Plane?",
        "opts": [
          "Makers Mark",
          "Crown Royal",
          "Buffalo Trace",
          "Benchmark"
        ],
        "ans": 2,
        "exp": "Paper Plane: Buffalo Trace Bourbon, Amaro Nonino, Aperol and lemon juice"
      },
      {
        "q": "What in Cranberry Spiced Mule?",
        "opts": [
          "Absolut Vodka, lime, cranberry, ginger beer",
          "Deep Eddy Vodka, lime juice, cranberry juice, cinnamon, ginger beer",
          "Ketel One, cranberry, lime, soda",
          "Grey Goose, cranberry, ginger ale"
        ],
        "ans": 1,
        "exp": "Cranberry Spiced Mule: Deep Eddy Vodka, fresh lime juice, cranberry juice, cinnamon, ginger beer"
      },
      {
        "q": "What bourbon in Maple Old Fashioned?",
        "opts": [
          "Buffalo Trace",
          "Angel's Envy",
          "Crown Royal",
          "Makers Mark"
        ],
        "ans": 0,
        "exp": "Maple Old Fashioned: Buffalo Trace Bourbon, maple syrup, cinnamon, vanilla, allspice, bitters"
      },
      {
        "q": "What in Peach Bellini?",
        "opts": [
          "Prosecco and peach puree",
          "Champagne, rum, peach schnapps, peach puree",
          "Champagne and peach schnapps",
          "Vodka and peach"
        ],
        "ans": 1,
        "exp": "Peach Bellini: Champagne, Don Q rum, Peach Schnapps, peach puree"
      }
    ]
  },
  "soups_test": {
    "id": "soups_test",
    "title": "Starters, Soups, Salads, Burgers & Sandwiches - Final Test",
    "passing_score": 85,
    "questions": [
      {
        "q": "What describes our Queso?",
        "opts": [
          "Melted cheese, green chilies, peppers, spicy sausage, salsa, fresh tortilla chips",
          "Spinach, artichokes, parmesan, melted jack cheese, salsa, sour cream, tortilla chips",
          "Melted cheese, red chilies, peppers, spicy sausage, salsa, sour cream, tortilla chips",
          "Just melted cheese and tortilla chips"
        ],
        "ans": 0,
        "exp": "Queso: Melted cheese, green chilies, peppers, and spicy sausage served with salsa and fresh tortilla chips"
      },
      {
        "q": "What describes Spinach Artichoke Dip?",
        "opts": [
          "Spinach, artichokes, parmesan sauce, melted jack cheese, salsa, sour cream, fresh tortilla chips",
          "Spinach, artichokes, alfredo sauce, mozzarella, crackers",
          "Spinach, artichokes, cream cheese, cheddar, pita bread",
          "Spinach, artichokes, parmesan, blue cheese, tortilla chips"
        ],
        "ans": 0,
        "exp": "Spinach Artichoke Dip: Spinach, artichokes, parmesan cheese sauce, melted jack cheese, served with salsa, sour cream, fresh tortilla chips"
      },
      {
        "q": "How many shrimp in Shrimp Cargot?",
        "opts": [
          "4 shrimp",
          "5 shrimp",
          "6 shrimp",
          "7 shrimp"
        ],
        "ans": 2,
        "exp": "Shrimp Cargot has 6 seasoned shrimp with garlic butter, havarti cheese on toasted french bread"
      },
      {
        "q": "Which soup is served EVERY DAY?",
        "opts": [
          "Chicken Tortilla",
          "Tomato Basil",
          "Baked Potato",
          "Chili"
        ],
        "ans": 2,
        "exp": "Baked Potato soup is served every single day"
      },
      {
        "q": "What is MONDAY soup?",
        "opts": [
          "Tomato Basil",
          "Chicken Tortilla",
          "Creamy Chicken Noodle",
          "Clam Chowder"
        ],
        "ans": 1,
        "exp": "Monday: Chicken Tortilla"
      },
      {
        "q": "What is TUESDAY soup?",
        "opts": [
          "Chicken Tortilla",
          "Creamy Chicken Noodle",
          "Southwestern Bean",
          "Beef and Vegetable"
        ],
        "ans": 1,
        "exp": "Tuesday: Creamy Chicken Noodle"
      },
      {
        "q": "What is WEDNESDAY soup?",
        "opts": [
          "Creamy Chicken Noodle",
          "Southwestern Bean",
          "New England Clam Chowder",
          "Beef and Vegetable"
        ],
        "ans": 1,
        "exp": "Wednesday: Southwestern Bean"
      },
      {
        "q": "What is THURSDAY soup?",
        "opts": [
          "Southwestern Bean",
          "Beef and Vegetable",
          "New England Clam Chowder",
          "Moss Point Gumbo"
        ],
        "ans": 1,
        "exp": "Thursday: Beef and Vegetable"
      },
      {
        "q": "What is FRIDAY soup?",
        "opts": [
          "Beef and Vegetable",
          "New England Clam Chowder",
          "Moss Point Gumbo",
          "Chicken Tortilla"
        ],
        "ans": 1,
        "exp": "Friday: New England Clam Chowder"
      },
      {
        "q": "What is SATURDAY soup?",
        "opts": [
          "New England Clam Chowder",
          "Moss Point Gumbo",
          "Chicken Tortilla",
          "Beef and Vegetable"
        ],
        "ans": 1,
        "exp": "Saturday: Moss Point Gumbo"
      },
      {
        "q": "What is SUNDAY soup?",
        "opts": [
          "Beef and Vegetable",
          "Moss Point Gumbo",
          "Chicken Tortilla",
          "Baked Potato"
        ],
        "ans": 1,
        "exp": "Sunday: Moss Point Gumbo"
      },
      {
        "q": "Which TWO soups are served daily in season?",
        "opts": [
          "Chicken Noodle and Tomato Basil",
          "Chili and Tomato Basil",
          "Chili and Chicken Tortilla",
          "Tomato Basil and Clam Chowder"
        ],
        "ans": 1,
        "exp": "Chili and Tomato Basil are both served daily during their seasons"
      },
      {
        "q": "How many ounces is a bowl of soup?",
        "opts": [
          "8oz",
          "10oz",
          "12oz",
          "16oz"
        ],
        "ans": 1,
        "exp": "Bowl of soup is 10oz"
      },
      {
        "q": "Should soup go out first or last?",
        "opts": [
          "Last",
          "First unless requested otherwise",
          "At same time as entree",
          "Whenever ready"
        ],
        "ans": 1,
        "exp": "Soup should ALWAYS go out FIRST unless guest requests otherwise"
      },
      {
        "q": "House/Caesar NC means?",
        "opts": [
          "No cheese",
          "No croutons",
          "No charge - complimentary with steaks/fish",
          "Not available"
        ],
        "ans": 2,
        "exp": "NC = No Charge - complimentary salad with steaks and fish"
      },
      {
        "q": "House/Caesar SUB means and costs?",
        "opts": [
          "Substitute salad for side - $3 upcharge",
          "Substitute salad for side - $5 upcharge",
          "Subtract an item - no charge",
          "Substitute salad for side - $9 upcharge"
        ],
        "ans": 0,
        "exp": "SUB = $3 upcharge to substitute salad for side"
      },
      {
        "q": "House/Caesar RED means and costs?",
        "opts": [
          "$5 upcharge - add salad keep side",
          "$7 upcharge - add salad keep side",
          "$9 upcharge - add salad AND keep side",
          "$12 upcharge - add salad keep side"
        ],
        "ans": 2,
        "exp": "RED = $9 upcharge to add salad AND keep the side"
      },
      {
        "q": "House/Caesar AL means and costs?",
        "opts": [
          "$8 a la carte",
          "$10 a la carte salad alone",
          "$12 a la carte",
          "$15 a la carte"
        ],
        "ans": 1,
        "exp": "AL = $10 a la carte (salad by itself)"
      },
      {
        "q": "What is IN our House Salad?",
        "opts": [
          "Just lettuce, tomato, croutons",
          "Head lettuce, romaine, red cabbage, green cabbage, field greens, carrots, eggs, bacon, croutons, tomato",
          "Lettuce, tomato, cucumber, onions, croutons",
          "Mixed greens, tomato, cheese, croutons"
        ],
        "ans": 1,
        "exp": "House salad: Head lettuce, romaine, red and green cabbage, field greens, carrots, eggs, bacon, croutons, tomato"
      },
      {
        "q": "What 4 things different on Chicken Club Salad vs House?",
        "opts": [
          "Avocado, green onions, lightly fried chicken, dressing on side",
          "Grilled chicken, cheese, tomatoes, ranch",
          "Bacon, eggs, chicken, cheese",
          "Avocado, chicken, tortilla strips, salsa"
        ],
        "ans": 0,
        "exp": "Chicken Club adds: Avocado, green onions, lightly fried chicken, and dressing served on the side (not house salad base)"
      },
      {
        "q": "What in Walt's Champagne Chicken Salad?",
        "opts": [
          "Grilled chicken, lettuce, champagne dressing",
          "Sunflower seeds, strawberries, spiced pecans, pineapple, feta, dates, croutons, grilled chicken, champagne vinaigrette",
          "Fried chicken, apples, walnuts, champagne dressing",
          "Mixed greens, grilled chicken, fruits, champagne vinaigrette"
        ],
        "ans": 1,
        "exp": "Walt's: Sunflower seeds, strawberries, spiced pecans, pineapple, feta cheese, dates, croutons, grilled chicken, champagne vinaigrette"
      },
      {
        "q": "RARE is?",
        "opts": [
          "Cold red center",
          "Cool red center",
          "Warm red center",
          "Hot red center"
        ],
        "ans": 1,
        "exp": "RARE = cool red center"
      },
      {
        "q": "MEDIUM RARE is?",
        "opts": [
          "Cool red center",
          "Warm red center",
          "Hot red center",
          "Hot pink center"
        ],
        "ans": 1,
        "exp": "MEDIUM RARE = warm red center"
      },
      {
        "q": "MEDIUM is?",
        "opts": [
          "Warm red center",
          "Hot red center",
          "Hot pink center",
          "Hot slightly pink"
        ],
        "ans": 2,
        "exp": "MEDIUM = hot pink center"
      },
      {
        "q": "MEDIUM WELL is?",
        "opts": [
          "Hot pink center",
          "Hot slightly pink",
          "Hot mostly brown",
          "Hot brown throughout"
        ],
        "ans": 1,
        "exp": "MEDIUM WELL = hot slightly pink"
      },
      {
        "q": "WELL DONE is?",
        "opts": [
          "Hot slightly pink",
          "Hot mostly brown",
          "Hot brown throughout",
          "Warm brown"
        ],
        "ans": 2,
        "exp": "WELL DONE = hot brown throughout (no pink)"
      },
      {
        "q": "All burgers are what size?",
        "opts": [
          "6oz",
          "7oz",
          "8oz",
          "10oz"
        ],
        "ans": 2,
        "exp": "All burgers are 8oz"
      },
      {
        "q": "What wood do we cook over?",
        "opts": [
          "Mesquite",
          "Cherry",
          "Hickory",
          "Oak"
        ],
        "ans": 2,
        "exp": "We cook over hickory wood"
      },
      {
        "q": "What does DRY mean?",
        "opts": [
          "Well done",
          "No vegetables",
          "No sauce at all",
          "No cheese"
        ],
        "ans": 2,
        "exp": "DRY = no sauce at all"
      },
      {
        "q": "What does NAKED mean?",
        "opts": [
          "No bun",
          "No vegetables",
          "No cheese",
          "No condiments"
        ],
        "ans": 1,
        "exp": "NAKED = no vegetables"
      },
      {
        "q": "What does PLAIN mean?",
        "opts": [
          "No cheese",
          "No sauce",
          "No vegetables",
          "Just meat and bun - no sauce OR vegetables"
        ],
        "ans": 3,
        "exp": "PLAIN = just meat and bun (no sauce, no vegetables)"
      },
      {
        "q": "What describes our Cheeseburger?",
        "opts": [
          "Wheat bun, cheddar, mayo, LTP diced onion, standard with fries",
          "House-made egg bun, cheddar, mayo, lettuce tomato pickle diced onion, standard with fries",
          "House-made egg bun, swiss cheese, mayo, LTP, fries",
          "Regular bun, american cheese, ketchup mustard, LTP, fries"
        ],
        "ans": 1,
        "exp": "Cheeseburger: House-made egg bun, cheddar cheese, mayo, lettuce, tomato, pickle, diced onion, served standard with french fries"
      },
      {
        "q": "What describes Grilled Chicken Avocado Club?",
        "opts": [
          "Grilled chicken, swiss, avocado, bacon, sprouts, tomatoes on wheat with honey mustard, fries",
          "Blackened chicken, swiss, avocado, bacon, sprouts, tomatoes on wheatberry with honey mustard, fries",
          "Fried chicken, jack cheese, avocado, bacon, lettuce tomato on wheat, fries",
          "Grilled chicken, cheddar, avocado, bacon, sprouts on sourdough, fries"
        ],
        "ans": 1,
        "exp": "GACA: Swiss cheese, avocado, bacon, sprouts, tomatoes, blackened chicken, deli style wheatberry bread, honey mustard, fries"
      },
      {
        "q": "What describes Famous French Dip?",
        "opts": [
          "French bread, shaved prime rib, mayo, au jus",
          "Hoagie roll, roast beef, swiss, au jus",
          "French bread, prime rib, horseradish, au jus",
          "Sourdough, prime rib, pepper jack, mayo, au jus"
        ],
        "ans": 0,
        "exp": "Famous French Dip: French bread, shaved prime rib, mayonnaise, au jus"
      },
      {
        "q": "What describes Grilled Cheese?",
        "opts": [
          "White bread, american cheese, tomato soup",
          "Wheat bread, cheddar, tomato soup",
          "Parmesan crusted sourdough, fontina cheddar white cheddar, served with tomato soup",
          "Sourdough, swiss and cheddar, served with fries"
        ],
        "ans": 2,
        "exp": "Grilled Cheese: Parmesan crusted sourdough with fontina, cheddar and white cheddar cheeses, served with tomato soup"
      }
    ]
  },
  "steaks_test": {
    "id": "steaks_test",
    "title": "Steaks, Specialties, Chicken & Desserts - Final Test",
    "passing_score": 85,
    "questions": [
      {
        "q": "Which describes Hand-cut Filet?",
        "opts": [
          "7oz center cut with vegetable medley and house or caesar",
          "8oz center cut with loaded baked potato and house or caesar",
          "7oz center cut with loaded baked potato and vegetable medley",
          "8oz center cut with mashed potatoes and house or caesar"
        ],
        "ans": 0,
        "exp": "Hand-cut Filet is 7oz center cut, served with mixed vegetable medley and house or caesar salad"
      },
      {
        "q": "What comes standard with Charleston Ribeye?",
        "opts": [
          "Loaded baked potato and vegetables",
          "Mashed potatoes and fried onion straws",
          "French fries and onion straws",
          "Baked potato and baked beans"
        ],
        "ans": 1,
        "exp": "Charleston Ribeye (14oz) comes with mashed potatoes, fried onion straws, and house or caesar salad"
      },
      {
        "q": "What size is Top Sirloin and what are standard sides?",
        "opts": [
          "10oz with loaded baked potato",
          "12oz with mashed potatoes",
          "10oz with mashed potatoes",
          "8oz with mashed potatoes"
        ],
        "ans": 2,
        "exp": "Top Sirloin is 10oz center cut, served standard with mashed potatoes and house or caesar salad"
      },
      {
        "q": "What sauce comes with Filet Tips?",
        "opts": [
          "Au jus",
          "Béarnaise sauce",
          "Cabernet reduction sauce",
          "Peppercorn sauce"
        ],
        "ans": 2,
        "exp": "Filet Tips (8oz) come with button mushrooms and cabernet reduction sauce, served with mashed potatoes"
      },
      {
        "q": "How are Grilled Pork Chops cooked?",
        "opts": [
          "Medium rare to medium",
          "Medium only",
          "Medium or well done",
          "Well done only"
        ],
        "ans": 2,
        "exp": "Two 8oz pork chops cooked medium or well done, with mashed potatoes and baked beans"
      },
      {
        "q": "What size slab are BBQ Baby Back Ribs?",
        "opts": [
          "12-14oz",
          "14-16oz",
          "16-18oz",
          "18-20oz"
        ],
        "ans": 1,
        "exp": "BBQ Baby Back Ribs are 14-16oz slab, served standard with french fries and baked beans"
      },
      {
        "q": "What describes Meatloaf?",
        "opts": [
          "Ground beef, pork sausage, mixed cheeses with tomato brown sauce, mashed and carrots",
          "Ground beef, veal, pork sausage with tomato sauce, mashed and carrots",
          "Ground beef, pork with brown gravy, loaded baked potato and vegetables",
          "Ground turkey, pork sausage with tomato sauce, mashed and carrots"
        ],
        "ans": 0,
        "exp": "Meatloaf: spicy ground beef, pork sausage, mixed cheeses, topped with roasted tomato brown sauce, served with garlic mashed potatoes and sweet glazed carrots"
      },
      {
        "q": "How many catfish filets in Catfish Platter and what size?",
        "opts": [
          "2 filets (5-7oz each)",
          "3 filets (3-5oz each)",
          "3 filets (5-7oz each)",
          "4 filets (3-5oz each)"
        ],
        "ans": 1,
        "exp": "Catfish Platter has 3 catfish filets (3-5oz each), hand breaded and deep fried, with tartar sauce, french fries and cole slaw"
      },
      {
        "q": "What describes Short Smoked Salmon?",
        "opts": [
          "8oz salmon, mustard sauce, cucumber relish, vegetable medley and salad",
          "9oz salmon, lemon butter, vegetables and loaded potato",
          "7oz salmon, whole grain mustard, cucumber relish and mashed potatoes",
          "10oz salmon, béarnaise sauce, vegetables and salad"
        ],
        "ans": 0,
        "exp": "8oz fresh salmon, marinated and quickly smoked then hardwood grilled, topped with whole grain mustard sauce on cucumber relish, with vegetable medley and house or caesar salad"
      },
      {
        "q": "What describes Blackened Red Fish Tacos?",
        "opts": [
          "2 flour tortillas, 6oz fish, jack cheese, rice and beans",
          "2 corn tortillas, 4oz blackened red fish, coleslaw, avocado aioli, pickled red onions, cilantro, jack cheese, rice and beans with 2 limes",
          "3 corn tortillas, 4oz fish, sour cream, salsa, beans",
          "2 corn tortillas, 6oz fish, lettuce, tomato, cheese, rice"
        ],
        "ans": 1,
        "exp": "2 corn tortillas with coleslaw, 4oz blackened red fish, avocado aioli, pickled red onions, cilantro, monterey jack cheese, served with rice and beans and 2 lime quarters"
      },
      {
        "q": "Rigatoni Bolognese has how many meatballs?",
        "opts": [
          "3 large meatballs",
          "4 large meatballs",
          "5 large meatballs",
          "6 large meatballs"
        ],
        "ans": 2,
        "exp": "5 large meatballs with garlic and oregano in tomato and red pepper cream sauce, tossed with rigatoni noodles, served with toasted cheese bread"
      },
      {
        "q": "How many shrimp in Shrimp Scampi?",
        "opts": [
          "6 shrimp",
          "7 shrimp",
          "8 shrimp",
          "10 shrimp"
        ],
        "ans": 2,
        "exp": "8 sautéed shrimp with garlic, tomato, onion, parmesan, basil on angel hair pasta"
      },
      {
        "q": "How many shrimp in Shrimp Skewer?",
        "opts": [
          "5 jumbo shrimp",
          "6 jumbo shrimp",
          "7 jumbo shrimp",
          "8 jumbo shrimp"
        ],
        "ans": 2,
        "exp": "7 jumbo skewered shrimp, blackened or grilled, served on seasoned rice"
      },
      {
        "q": "What describes Oven Roasted Chicken?",
        "opts": [
          "Full herb rubbed chicken with mashed and baked beans",
          "Half herb rubbed chicken with mashed and baked beans",
          "Half herb rubbed chicken with loaded potato and vegetables",
          "Full herb rubbed chicken with vegetables and mashed"
        ],
        "ans": 1,
        "exp": "Half of an herb rubbed chicken, served with mashed potatoes and baked beans"
      },
      {
        "q": "How many ounces is Chicken Tender Platter?",
        "opts": [
          "8oz tenders",
          "9oz tenders",
          "10oz tenders",
          "12oz tenders"
        ],
        "ans": 1,
        "exp": "9oz breaded and deep fried chicken tenders with hickory sauce and honey mustard, served with french fries and coleslaw"
      },
      {
        "q": "How many chicken breasts in Chicken Fried Chicken?",
        "opts": [
          "1 breast",
          "2 breasts",
          "3 breasts",
          "4 breasts"
        ],
        "ans": 1,
        "exp": "2 fried chicken breasts with chipotle black pepper gravy, served with mashed potatoes and carrots"
      },
      {
        "q": "What pasta is Chicken Marsala served on?",
        "opts": [
          "Penne pasta",
          "Fettuccine",
          "Angel hair pasta",
          "Rigatoni"
        ],
        "ans": 2,
        "exp": "Three 3oz pan sautéed chicken breasts with sweet marsala wine reduction sauce and mushrooms, served on angel hair pasta with mixed vegetables"
      },
      {
        "q": "What describes Parmesan Crusted Chicken?",
        "opts": [
          "One breast, parmesan crust, marinara, on pasta with salad",
          "Two breasts, parmesan-walnut-pecan crust, marinara, on angel hair with herbal salad",
          "Two breasts, breadcrumb crust, alfredo, on fettuccine with vegetables",
          "Three breasts, parmesan crust, marinara, with mashed potatoes"
        ],
        "ans": 1,
        "exp": "Two chicken breasts seasoned in parmesan, walnut and pecan crust, topped with marinara, served on angel hair pasta with pear tomato, mozzarella and red onion herbal salad"
      },
      {
        "q": "What describes Chicken Piccata?",
        "opts": [
          "Two 3oz breasts, artichokes, asparagus, grape tomatoes, lemon caper butter sauce, on angel hair with vegetables",
          "Three 3oz breasts, mushrooms, onions, white wine sauce, on fettuccine",
          "Two 4oz breasts, capers, lemon butter, on pasta with salad",
          "One 6oz breast, artichokes, lemon sauce, with mashed potatoes"
        ],
        "ans": 0,
        "exp": "Two 3oz pan sautéed chicken breasts with artichokes, asparagus, grape tomatoes, lemon caper butter sauce, served over angel hair pasta with vegetable medley"
      },
      {
        "q": "What describes Roast Beef Croissant?",
        "opts": [
          "Sourdough bread, roast beef, swiss cheese, au jus",
          "Butter croissant, sliced roast beef, mayo, lettuce, tomato with fries",
          "French bread, shaved roast beef, horseradish, au jus",
          "Wheat bread, roast beef, cheddar, lettuce with soup"
        ],
        "ans": 1,
        "exp": "Butter croissant with sliced roast beef, mayonnaise, leaf lettuce, tomato, served with fries"
      },
      {
        "q": "What TWO things come with EVERY kids meal?",
        "opts": [
          "Fries and drink",
          "Beverage and chocolate chip cookie with ice cream",
          "Milk and dessert",
          "Fruit and cookie"
        ],
        "ans": 1,
        "exp": "Every kids meal includes beverage of choice and chocolate chip cookie with ice cream"
      },
      {
        "q": "What age restriction for kids meals?",
        "opts": [
          "10 and under",
          "12 and under",
          "Anyone can order",
          "Must be under 8"
        ],
        "ans": 2,
        "exp": "Anyone can order off the kids menu regardless of age"
      },
      {
        "q": "What crust is Key Lime Pie?",
        "opts": [
          "Graham cracker only",
          "Graham cracker and walnut",
          "Graham cracker, walnut and pecan",
          "Oreo crust"
        ],
        "ans": 2,
        "exp": "Graham cracker, walnut and pecan crust filled with natural key lime custard, topped with homemade whipped cream and graham cracker crumbs"
      },
      {
        "q": "What sauce tops Nick Bread Pudding?",
        "opts": [
          "Caramel sauce",
          "Chocolate sauce",
          "Grand Marnier sauce",
          "Vanilla sauce"
        ],
        "ans": 2,
        "exp": "French bread and raisins in sweet custard, topped with grand marnier sauce, cocoa powder, berries and mint leaf"
      },
      {
        "q": "What type of cheesecake is Adam Cheesecake?",
        "opts": [
          "Chocolate cheesecake",
          "Strawberry cheesecake",
          "Sweet vanilla cheesecake",
          "New York style"
        ],
        "ans": 2,
        "exp": "Our in-house recipe: large slice of sweet vanilla cheesecake topped with blueberry compote, limoncello creme anglaise, blueberry sauce and whipped cream"
      },
      {
        "q": "Rainbow Ruby Trout can be prepared how?",
        "opts": [
          "Grilled only",
          "Blackened only",
          "Grilled or blackened",
          "Pan seared only"
        ],
        "ans": 2,
        "exp": "Rainbow Ruby Trout can be grilled or blackened, served over rice, topped with beurre blanc and relish, with vegetables and house or caesar salad"
      },
      {
        "q": "What wood do we cook over?",
        "opts": [
          "Mesquite wood",
          "Cherry wood",
          "Hickory wood",
          "Oak wood"
        ],
        "ans": 2,
        "exp": "All our steaks and proteins are grilled over hickory wood"
      },
      {
        "q": "What three ingredients in Parmesan Crusted Chicken crust?",
        "opts": [
          "Parmesan only",
          "Parmesan, walnuts and pecans",
          "Parmesan, mozzarella and cheddar",
          "Parmesan and romano"
        ],
        "ans": 1,
        "exp": "The crust is parmesan cheese combined with walnuts and pecans"
      },
      {
        "q": "What sauce is on Filet Tips?",
        "opts": [
          "Red wine reduction",
          "Cabernet reduction",
          "Burgundy reduction",
          "Merlot reduction"
        ],
        "ans": 1,
        "exp": "Filet Tips are served with button mushrooms and cabernet reduction sauce"
      },
      {
        "q": "How many ounces is Chicken Marsala chicken total?",
        "opts": [
          "6oz (two 3oz breasts)",
          "9oz (three 3oz breasts)",
          "8oz (two 4oz breasts)",
          "12oz (three 4oz breasts)"
        ],
        "ans": 1,
        "exp": "Chicken Marsala has three 3oz pan sautéed chicken breasts (9oz total)"
      }
    ]
  },
  "bonus_test": {
    "id": "bonus_test",
    "title": "Bonus Points",
    "passing_score": 85,
    "questions": [
      {
        "q": "What are the 4 R's of the Red Check Procedure?",
        "opts": [
          "Remove, Report, Red Check, Run",
          "Review, Ring, Run, Return",
          "Remove, Re-cook, Run, Review",
          "Report, Remove, Re-plate, Run"
        ],
        "ans": 0,
        "exp": "1. Remove item. 2. Report to expediter. 3. Write Red Check. 4. Manager Runs the food.",
        "isBonus": true
      },
      {
        "q": "According to the '10 Step Rule', what must you do after dropping the check?",
        "opts": [
          "Go to the kitchen immediately",
          "Stay within 10 feet of the table to process payment if they are ready",
          "Check on your other tables",
          "Pre-bus the entire table"
        ],
        "ans": 1,
        "exp": "Once the check is down, stay within 10 feet. If they pay immediately, process it immediately.",
        "isBonus": true
      },
      {
        "q": "What is the 'Dime Lip' standard?",
        "opts": [
          "The rim of the glass must be polished",
          "Beverages should be filled to a dime's width below the rim",
          "The foam on a beer should be the size of a dime",
          "Leave a dime on the table to signal service is complete"
        ],
        "ans": 1,
        "exp": "Leave a 'dime lip' (space) at the top of the glass to prevent spilling while carrying.",
        "isBonus": true
      },
      {
        "q": "In the Pivot Point system, which seat is Position 1?",
        "opts": [
          "The head of the table",
          "The seat closest to the front door",
          "The seat to the server's immediate left",
          "The seat to the server's immediate right"
        ],
        "ans": 2,
        "exp": "Seat 1 is the person to the server's immediate left. Number clockwise from there.",
        "isBonus": true
      },
      {
        "q": "What is the maximum time allowed to greet a table?",
        "opts": [
          "30 Seconds",
          "45 Seconds",
          "1 Minute",
          "2 Minutes"
        ],
        "ans": 0,
        "exp": "You must greet every table within 30 seconds. Use bev naps to signal the table has been greeted.",
        "isBonus": true
      },
      {
        "q": "Which of these is a 'Lazy Word' you should never use?",
        "opts": [
          "Delicious",
          "Dessert",
          "Feature",
          "Favorite"
        ],
        "ans": 1,
        "exp": "Never use 'Appetizer', 'Drink', or 'Dessert'. Instead, suggest specific favorites like 'Key Lime Pie'.",
        "isBonus": true
      },
      {
        "q": "How many times should a guest hear 'Hello' and 'Thank You'?",
        "opts": [
          "3 times each",
          "5 times each",
          "Once per course",
          "Whenever possible"
        ],
        "ans": 1,
        "exp": "Every guest should hear 'Hello' and 'Thank You' 5 times each during their visit.",
        "isBonus": true
      },
      {
        "q": "What does 'Full Hands In' mean?",
        "opts": [
          "Entering the kitchen with dirty dishes",
          "Leaving the kitchen with food",
          "Carrying 3 drinks in one hand",
          "Always having a tray"
        ],
        "ans": 0,
        "exp": "Full Hands In: Enter the kitchen with dirty dishes from your section or your buddy's.",
        "isBonus": true
      },
      {
        "q": "How do you handle a refill for a Fountain Drink (Coke)?",
        "opts": [
          "Bring a pitcher",
          "Refill the same glass",
          "Remove the old glass when delivering the fresh one",
          "Ask if they want one"
        ],
        "ans": 2,
        "exp": "For sodas, remove the old glass immediately when the fresh refill is delivered.",
        "isBonus": true
      },
      {
        "q": "How do you handle a refill for Iced Tea?",
        "opts": [
          "Remove the glass immediately",
          "Leave the glass until empty",
          "Bring a pitcher",
          "Only refill if requested"
        ],
        "ans": 1,
        "exp": "For Tea: Leave the glass until empty. The guest may have perfected their lemon/sugar ratio.",
        "isBonus": true
      },
      {
        "q": "Who has the 'Right of Way' in the restaurant?",
        "opts": [
          "The Server with hot food",
          "The Manager",
          "The Guest",
          "The Expediter"
        ],
        "ans": 2,
        "exp": "The Guest always has the right of way. If they are passing, you stop and wait.",
        "isBonus": true
      },
      {
        "q": "What is the proper way to handle a guest complaint?",
        "opts": [
          "Explain why it happened",
          "Apologize and fix it yourself",
          "Get a Manager immediately",
          "Offer a free dessert"
        ],
        "ans": 2,
        "exp": "As a server, you are not expected to handle complaints. Get a Manager immediately.",
        "isBonus": true
      },
      {
        "q": "Where are employees allowed to smoke on property?",
        "opts": [
          "By the dumpster",
          "In their car",
          "Nowhere",
          "On the patio after hours"
        ],
        "ans": 2,
        "exp": "There is no smoking allowed by any employees while at work (including E-cigarettes).",
        "isBonus": true
      },
      {
        "q": "When serving an entree, who do you serve first?",
        "opts": [
          "The Host",
          "The oldest Lady",
          "The oldest Gentleman",
          "The seat closest to you"
        ],
        "ans": 1,
        "exp": "Order of service: Oldest Lady, other Ladies, Oldest Gentleman, other Gentlemen.",
        "isBonus": true
      },
      {
        "q": "What defines a 'Big Top' regarding server assignment?",
        "opts": [
          "More than 6 guests",
          "More than 8 guests",
          "More than 12 guests requires two servers",
          "Any booth"
        ],
        "ans": 2,
        "exp": "We allow a maximum of 12 guests to one server. Larger parties require two servers.",
        "isBonus": true
      },
      {
        "q": "How often should Restroom Checks be performed?",
        "opts": [
          "Every 15 minutes",
          "Every 30 minutes",
          "Every hour",
          "Once per shift"
        ],
        "ans": 1,
        "exp": "Restroom checks are everyone's sidework and are done every 30 minutes.",
        "isBonus": true
      },
      {
        "q": "What is the difference between 'Pre-bussing' and 'Manicuring'?",
        "opts": [
          "They are the same thing",
          "Pre-bussing is plates/glasses; Manicuring is small debris (straws, wrappers)",
          "Pre-bussing is for bussers; Manicuring is for servers",
          "Manicuring is wiping the table"
        ],
        "ans": 1,
        "exp": "Pre-bussing removes large items. Manicuring removes small items like straw wrappers, sugar packets, and empty ramekins.",
        "isBonus": true
      },
      {
        "q": "What is the standard time for 'First Time Beverages' to arrive?",
        "opts": [
          "1 Minute",
          "2 Minutes",
          "3 Minutes",
          "5 Minutes"
        ],
        "ans": 1,
        "exp": "The guest should receive their beverages within 2 minutes of ordering.",
        "isBonus": true
      },
      {
        "q": "If a guest asks where the restroom is, what do you do?",
        "opts": [
          "Point and give clear directions",
          "Say 'down the hall to the left'",
          "Say 'Right this way' and walk them there",
          "Draw a map on a napkin"
        ],
        "ans": 2,
        "exp": "Never give directions. Say 'Absolutely, right this way' and take them there.",
        "isBonus": true
      },
      {
        "q": "When refilling coffee at the table, you should:",
        "opts": [
          "Pour carefully while the mug is on the table",
          "Pick up the mug and turn slightly away from the guest",
          "Bring a fresh mug from the kitchen",
          "Ask the guest to hold the mug"
        ],
        "ans": 1,
        "exp": "Pick the mug up by the handle and turn slightly away to avoid splashing the guest.",
        "isBonus": true
      },
      {
        "q": "What percentage of tips must wait staff declare?",
        "opts": [
          "10%",
          "50%",
          "85%",
          "100%"
        ],
        "ans": 3,
        "exp": "Wait staff and bartenders are required to declare 100% of their tips.",
        "isBonus": true
      },
      {
        "q": "When do you present the check at LUNCH?",
        "opts": [
          "When they ask for it",
          "After offering dessert",
          "Once the entree has arrived (Check Back/Check Down)",
          "After the meal is finished"
        ],
        "ans": 2,
        "exp": "At lunch, present the check once the entree has arrived to allow the guest to get back to work.",
        "isBonus": true
      },
      {
        "q": "If a guest orders a burger 'Dry', what does that mean?",
        "opts": [
          "No cheese",
          "No vegetables",
          "No sauce at all",
          "Well done"
        ],
        "ans": 2,
        "exp": "Dry means no sauce at all (but vegetables are okay).",
        "isBonus": true
      },
      {
        "q": "What phrase should you use when reaching across a guest?",
        "opts": [
          "Excuse me",
          "Watch out",
          "Pardon my reach",
          "Coming through"
        ],
        "ans": 2,
        "exp": "Use the phrase 'Pardon my reach' if you must reach across a guest (common in booths).",
        "isBonus": true
      },
      {
        "q": "When are schedule requests due?",
        "opts": [
          "The Friday before",
          "The Sunday two weeks prior",
          "Any time",
          "The 1st of the month"
        ],
        "ans": 1,
        "exp": "Requests must be in by the Sunday two weeks prior to the posting of the new schedule.",
        "isBonus": true
      }
    ]
  }
};

export const TESTS = [
  {
    "id": "bar_test",
    "title": "Bar & Beer Knowledge - Final Test",
    "passing_score": 85
  },
  {
    "id": "wines_test",
    "title": "Wine & Cocktail Knowledge - Final Test",
    "passing_score": 85
  },
  {
    "id": "soups_test",
    "title": "Starters, Soups, Salads, Burgers & Sandwiches - Final Test",
    "passing_score": 85
  },
  {
    "id": "steaks_test",
    "title": "Steaks, Specialties, Chicken & Desserts - Final Test",
    "passing_score": 85
  },
  {
    "id": "bonus_test",
    "title": "Bonus Points",
    "passing_score": 85
  }
];

export const SHIFT_TEST_RULES = [
  { shift: 'follow', testsAnyOf: [['starters', 'soups']] },
  { shift: 'rev1', testsAnyOf: [['steaks', 'specialties']] },
  { shift: 'rev2', testsAnyOf: [['bar', 'beer']] },
  { shift: 'rev3', testsAnyOf: [] },
  { shift: 'rev4', testsAnyOf: [] },
  { shift: 'foodrun', testsAnyOf: [['wine', 'cocktail'], ['wine', 'cocktails']] },
  { shift: 'cert', testsAnyOf: [] },
];

export const PRETTY_TEST_NAMES = {
  bar_test: 'Bar & Beer Test',
  starters_soups_test: 'Starters, Soups & Salads Test',
  soups_test: 'Soups Test',
  steaks_specialties_test: 'Steaks & Specialties Test',
  steaks_test: 'Steaks & Specialties Test',
  wine_cocktails_test: 'Wine & Cocktails Test',
  wines_test: 'Wine & Cocktails Test',
  wine_test: 'Wine & Cocktails Test',
};
