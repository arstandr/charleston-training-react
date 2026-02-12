/**
 * Standards & 7 Steps quiz data for trainer-led shift quizzes.
 * Used by StandardsQuizModal: shift-specific scenarios + always the 7 steps.
 */

export const SEVEN_STEPS_SCENARIOS = [
  { id: 'step_1', title: 'Step 1: Your Section', prompt: "Trainer asks: 'What is Step 1?'", standard: 'Your Section: Greet tables (30 sec), anticipate needs, pre-bus/manicure before leaving.' },
  { id: 'step_2', title: 'Step 2: The Weave', prompt: "Trainer asks: 'What is Step 2?'", standard: 'The Weave: Take the long way to the kitchen to pick up dirty dishes (Full Hands In).' },
  { id: 'step_3', title: 'Step 3: Hobart', prompt: "Trainer asks: 'What is Step 3?'", standard: "Hobart: Drop dishes in designated spots. 'Turn and Pull' to restock expo. Use 'Drop and Go'." },
  { id: 'step_4', title: 'Step 4: P.O.S.', prompt: "Trainer asks: 'What is Step 4?'", standard: 'P.O.S.: Ring in orders immediately after dropping dishes. Print checks and authorize cards.' },
  { id: 'step_5', title: 'Step 5: Sidework', prompt: "Trainer asks: 'What is Step 5?'", standard: 'Sidework: Check running duties (Ice, Tea, Restocking) to keep the store ready.' },
  { id: 'step_6', title: 'Step 6: Section Needs', prompt: "Trainer asks: 'What is Step 6?'", standard: 'Section Needs: Consolidate everything your tables need (refills, condiments, boxes) into ONE trip.' },
  { id: 'step_7', title: 'Step 7: Food Run', prompt: "Trainer asks: 'What is Step 7?'", standard: "Food Run: #1 Priority. Full Hands Out. Check with expediter ('One Hand/Two Hands')." },
]

export const TRAINING_SCENARIOS = [
  { id: 'scn_01', title: 'The 30-Second Greet', prompt: "You are double-sat. Table 21 has been waiting 45 seconds. Your hands are full. What do you do?", standard: "Acknowledge immediately ('I'll be right with you'), drop dishes (Full Hands In), then greet." },
  { id: 'scn_02', title: 'Lazy Words', prompt: "A guest asks 'What appetizers do you have?' Respond without using the word 'Appetizer'.", standard: "Suggest specific favorites (e.g., 'Can I start you with our Spinach Dip or Shrimp Cargot?')." },
  { id: 'scn_03', title: 'Full Hands In', prompt: 'You are heading to the kitchen empty-handed. You see a dirty plate on a table in another section. What do you do?', standard: 'Pick it up. Never enter the kitchen empty-handed.' },
  { id: 'scn_04', title: 'The Restroom Inquiry', prompt: "A guest asks 'Where is the restroom?'", standard: "Say 'Right this way' and walk them toward it. Never point." },
  { id: 'scn_05', title: 'Pre-Shift Audit', prompt: "The manager asks to see your 'Tools' for the shift. What 3 items must you present?", standard: '3 Black Click Pens, a Bank ($20 breakdown), and knowledge of Features.' },
  { id: 'scn_06', title: 'Pivot Point', prompt: "Trainer asks: 'Where is Seat 1?'", standard: "Seat 1 is to the server's immediate left. Number clockwise. Prevents 'auctioning' food." },
  { id: 'scn_07', title: 'Temperature Repeat', prompt: "Guest orders a steak. What must you do before leaving the table?", standard: 'Repeat the temperature back (e.g., Medium, Medium Rare) and ring in immediately.' },
  { id: 'scn_08', title: 'Modifiers on POS', prompt: "Trainer asks: 'How do you ring a burger with no tomato?'", standard: 'Use modifiers on POS. Never assume. Confirm with guest if unclear.' },
  { id: 'scn_09', title: 'Low Drink Anticipation', prompt: "A guest's tea is nearly empty. What do you do?", standard: 'Anticipate: offer refill before they ask. Consolidate with Section Needs (one trip).' },
  { id: 'scn_10', title: 'Table Approach', prompt: "Trainer asks: 'How do you approach a table to take an order?'", standard: 'Confident voice, eye contact, stand where all can hear. Pad ready, repeat back.' },
  { id: 'scn_11', title: 'ID Check', prompt: "Guest looks under 40 and orders a beer. What do you do?", standard: 'Card them. Check photo, DOB, expiration. Government-issued only.' },
  { id: 'scn_12', title: 'Tray Service', prompt: "Trainer asks: 'How do you carry multiple drinks?'", standard: "Use a tray. Don't 'claw' glasses. Carry by stem or base, never rim." },
  { id: 'scn_13', title: 'Bar Salesmanship', prompt: "Guest says 'I'll have a vodka soda.' How do you respond?", standard: "Suggest a specific brand (e.g., 'Tito's or Deep Eddy?'). Don't leave it generic." },
  { id: 'scn_14', title: 'Bar Consolidation', prompt: "You're going to the bar. Another server's drinks are up. What do you do?", standard: 'Run their drinks too (consolidation). No tunnel vision.' },
  { id: 'scn_15', title: 'Alcohol Limits', prompt: "A guest has had 3 drinks and orders another. What do you do?", standard: 'Alert the manager. Do not serve until manager approves.' },
  { id: 'scn_16', title: 'Full Hands In/Out', prompt: "You're leaving the kitchen with no food to run. What do you take?", standard: 'Water pitcher, tea refills, or run bar drinks. Never leave empty-handed.' },
  { id: 'scn_17', title: 'Manicuring', prompt: "Trainer asks: 'What is manicuring?'", standard: 'Pre-buss to wood: remove straw wrappers, empty ramekins, sugar packets before check down.' },
  { id: 'scn_18', title: 'The Weave (Section Check)', prompt: "You have one table. What do you do before going to the kitchen?", standard: 'Weave: check entire section. Don’t chop (ignore tables).' },
  { id: 'scn_19', title: 'Double-Sat Composure', prompt: "You get double-sat. How do you handle it?", standard: 'Greet both within 30 sec. Get drinks first. Stay calm; don’t panic.' },
  { id: 'scn_20', title: '10-Step Rule', prompt: "Trainer asks: 'After you drop the check, what is the rule?'", standard: 'Stay within 10 steps. If they pay immediately, process it immediately.' },
  { id: 'scn_21', title: 'Independence', prompt: "Trainer asks: 'Could this trainee take tables without you hovering?'", standard: 'Assess: Do they need constant check-ins or can they run solo?' },
  { id: 'scn_22', title: 'Timing / Coursing', prompt: "Appetizers just went out. When do you fire the entrees?", standard: 'Course properly. Don’t rush or drag. Coordinate with kitchen.' },
  { id: 'scn_23', title: 'Teamwork', prompt: "Your section is caught up. Another server is in the weeds. What do you do?", standard: 'Help: run food, refill drinks, pre-bus. Teamwork.' },
  { id: 'scn_24', title: 'Ready for Food Run?', prompt: "Would you send this trainee alone on a food run?", standard: 'Assess: Can they run food, seat numbers, and right-of-way without you?' },
  { id: 'scn_25', title: 'Friday Night Ready', prompt: "Would they survive a Friday night rush?", standard: 'Final verdict: Ready for certification or need more shifts?' },
]

/** [start, end) indices into TRAINING_SCENARIOS per shift. Always append SEVEN_STEPS_SCENARIOS in the modal. */
export const SHIFT_SCENARIO_MAP = {
  follow: [0, 5],
  rev1: [5, 10],
  rev2: [10, 15],
  rev3: [15, 20],
  rev4: [20, 25],
  foodrun: [10, 15],
  cert: [0, 10],
}

export function getScenariosForShift(shiftKey) {
  const range = SHIFT_SCENARIO_MAP[shiftKey]
  if (!range) return [...SEVEN_STEPS_SCENARIOS]
  const [start, end] = range
  const training = TRAINING_SCENARIOS.slice(start, end)
  return [...training, ...SEVEN_STEPS_SCENARIOS]
}
