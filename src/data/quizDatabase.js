// All quiz questions come from flashcard quizData (Firestore flashcardSets collection).
// Flashcards are the single source of truth — there is no static question database.

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
  { shift: 'rev3', testsAnyOf: [['wine', 'cocktail'], ['wine', 'cocktails']] },
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
