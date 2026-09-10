/** English UI message catalog (source of truth for keys). */
export const en = {
  'nav.study': 'Study',
  'nav.games': 'Games',
  'nav.cards': 'Cards',
  'nav.stats': 'Stats',
  'nav.words': 'Words',
  'nav.grammar': 'Grammar',
  'nav.rules': 'Rules',
  'nav.targets': 'Targets',
  'nav.translate': 'Translate',
  'nav.about': 'Sources and credits',
  'nav.signOut': 'Sign out',
  'nav.primary': 'Primary',
  'nav.family': 'Language family',
  'nav.germanic': 'Germanic',
  'nav.romance': 'Romance',
  'nav.uralic': 'Uralic',
  'nav.chooseRomance': 'Choose a Romance starting point on the home page first',

  'brand.name': 'Cognate Bridge',
  'brand.cognate': 'Cognate',
  'brand.bridge': 'Bridge',

  'auth.pitch':
    'Learn a bridge language, and get several others with it. Every word you study shows its cognate in your target languages, together with the sound-correspondence rule that helps predict it.',
  'auth.germanicTargets': 'German, Dutch, Danish, Norwegian, Swedish, French',
  'auth.romanceTargets': 'Spanish, French, Italian, Portuguese, Romanian',
  'auth.uralicNote': 'An experimental Finnish module is also available where enabled.',
  'auth.signIn': 'Sign in',
  'auth.createAccount': 'Create account',
  'auth.email': 'Email',
  'auth.password': 'Password',
  'auth.passwordTooShort': 'Password must be at least 8 characters',
  'auth.genericError': 'Something went wrong. Please try again.',
  'auth.submitSignIn': 'Sign in',
  'auth.submitRegister': 'Create account',
  'auth.submitting': 'Please wait…',

  'home.loading': 'Loading bridges',
  'home.words': 'Words',
  'home.grammarPatterns': 'Grammar patterns',
  'home.opensOnto': 'Opens onto',
  'home.studyWords': 'Study words',
  'home.match': 'Match',
  'home.grammar': 'Grammar',
  'home.browseAll': 'Browse all',
  'home.iaHint': 'The flagship bridge: a CC-BY vocabulary drawn from Interlingua, an international auxiliary language built from shared Romance and English roots.',
  'home.emptyTitle': 'No content loaded',
  'home.emptyBody':
    'The database has no bridge languages yet. Run the parsers and then npm run seed in server/.',

  'targets.title': 'Target languages',
  'targets.lede':
    'Choose which languages appear in the correspondence panel. Star one Germanic and/or one Romance language to sort it first.',
  'targets.loading': 'Loading languages',
  'targets.saving': 'Saving',
  'targets.saved': 'Saved',
  'targets.noneSelected':
    'No target languages selected. Second-tier cards show the English cognate.',
  'targets.priorityHint':
    'Star one Germanic and/or one Romance language to sort it first in the list.',
  'targets.prioritySummary': 'Priority',
  'targets.germanic': 'Germanic',
  'targets.romance': 'Romance',
  'targets.priorityMark': 'Mark {name} as {family} priority',
  'targets.priorityClear': '{name} is {family} priority (click to clear)',
  'targets.priorityTitle': 'Set as {family} priority (sorts first in your targets)',
  'targets.priorityTitleOn': '{family} priority (sorts first in your targets)',

  'common.loading': 'Loading…',
  'common.error': 'Something went wrong',
} as const;

export type MessageKey = keyof typeof en;
export type MessageCatalog = Record<MessageKey, string>;
