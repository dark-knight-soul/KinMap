import type { Dictionary } from './ru';

// Английские тексты интерфейса. Тип Dictionary не даст пропустить ключ.
export const en: Dictionary = {
  app: {
    tagline: 'A family tree that stays with you',
  },
  header: {
    language: 'Language',
    theme: 'Theme',
    themeSystem: 'System',
    themeLight: 'Light',
    themeDark: 'Dark',
  },
  welcome: {
    title: 'Your family tree',
    text: 'Add relatives, photos and stories. Everything is kept in a file on your device — no sign-up, no servers, no internet needed.',
    create: 'Create a new tree',
    open: 'Open a tree file',
    soon: 'Coming in the next version',
  },
  features: {
    privateTitle: 'Private by design',
    privateText: 'Your data never leaves your device. The tree file can be password-protected.',
    printTitle: 'Tiled printing',
    printText: 'Print a large tree on A4 or A3 sheets and glue them into one poster.',
    kinshipTitle: 'Relationship finder',
    kinshipText: 'Pick two people and KinMap tells how they are related.',
    gedcomTitle: 'GEDCOM',
    gedcomText: 'Move your tree from and to MyHeritage, Geni, Gramps and others.',
  },
  footer: {
    version: 'Version {{version}}',
    license: 'Open source, MIT license',
  },
};
