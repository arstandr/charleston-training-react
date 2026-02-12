/**
 * Shift-specific manager assessment questions.
 * Used by ManagerAssessSignModal to drive the readiness check (1–3 scale).
 */
export const MANAGER_ASSESSMENT_CONFIG = {
  follow: {
    title: 'Follow Shift Assessment',
    questions: [
      { id: 'engagement', label: 'Active Shadowing', desc: 'Was trainee writing down orders and engaged?' },
      { id: 'pivots', label: 'Pivot Points', desc: 'Did they know Seat 1 immediately?' },
      { id: 'lazy_words', label: 'Lazy Words', desc: "Did they avoid 'Guys', 'No Problem', 'Appetizer'?" },
      { id: 'menu', label: 'Menu Curiosity', desc: 'Did they ask good questions about food?' },
    ],
  },
  rev1: {
    title: '1st Reverse Assessment (Lunch/Steaks)',
    questions: [
      { id: 'accuracy', label: 'Order Accuracy', desc: 'Did they repeat temps? Ring in correctly?' },
      { id: 'pos', label: 'POS Competence', desc: 'Did they navigate modifiers without help?' },
      { id: 'approach', label: 'Table Approach', desc: 'Confident voice and posture at the table?' },
      { id: 'refills', label: 'Anticipation', desc: 'Noticed low drinks before guests asked?' },
    ],
  },
  rev2: {
    title: '2nd Reverse Assessment (Dinner/Bar)',
    questions: [
      { id: 'carding', label: 'ID & Alcohol Safety', desc: 'Did they check ID for <40? Aware of limits?' },
      { id: 'trays', label: 'Tray Service', desc: "Carried drinks properly? No 'clawing' glasses?" },
      { id: 'sales', label: 'Bar Salesmanship', desc: "Suggested specific liquor (Tito's vs Vodka)?" },
      { id: 'consolidation', label: 'Bar Consolidation', desc: 'Ran drinks for others? No tunnel vision?' },
    ],
  },
  rev3: {
    title: '3rd Reverse Assessment (Turn & Burn)',
    questions: [
      { id: 'hands', label: 'Full Hands In/Out', desc: 'Did they ever enter kitchen empty handed?' },
      { id: 'manicure', label: 'Manicuring', desc: 'Tables pre-bussed to wood before check down?' },
      { id: 'weaving', label: 'Weaving', desc: "Checked entire section, didn't chop?" },
      { id: 'stress', label: 'Composure', desc: 'Handled being double-sat without panic?' },
    ],
  },
  rev4: {
    title: '4th Reverse Assessment (Optional)',
    questions: [
      { id: 'independence', label: 'Independence', desc: 'Took tables without constant check-ins?' },
      { id: 'timing', label: 'Timing', desc: 'Coursed properly, no rushing or dragging?' },
      { id: 'teamwork', label: 'Teamwork', desc: 'Helped others when not busy?' },
      { id: 'readiness', label: 'Ready for Solo?', desc: 'Would you send them alone on food run?' },
    ],
  },
  foodrun: {
    title: 'Food Runner Assessment',
    questions: [
      { id: 'tickets', label: 'Ticket Times', desc: 'Prioritized hot food immediately?' },
      { id: 'seat_nums', label: 'Seat Accuracy', desc: "Dropped to correct seat? No 'auctioning'?" },
      { id: 'garnish', label: 'QA / Garnish', desc: 'Caught mistakes before leaving window?' },
      { id: 'row', label: 'Right of Way', desc: 'Yielded to guests while carrying food?' },
    ],
  },
  cert: {
    title: 'Final Certification',
    questions: [
      { id: 'host', label: 'Host Mentality', desc: 'Warmth, smiles, eye contact?' },
      { id: 'problem', label: 'Problem Solving', desc: "Did they own and fix mistakes (4 R's)?" },
      { id: 'romance', label: 'Menu Mastery', desc: "Can they sell the 'sizzle', not just ingredients?" },
      { id: 'verdict', label: 'The Verdict', desc: 'Would they survive a Friday night rush?' },
    ],
  },
}
