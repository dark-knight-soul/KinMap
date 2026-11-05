// Русские тексты интерфейса — эталон: в en.ts должны быть те же ключи (проверяет тест).
export const ru = {
  app: {
    tagline: 'Семейное древо, которое хранится только у вас',
  },
  header: {
    language: 'Язык',
    theme: 'Тема',
    themeSystem: 'Как в системе',
    themeLight: 'Светлая',
    themeDark: 'Тёмная',
  },
  welcome: {
    title: 'Ваше семейное древо',
    text: 'Добавляйте родственников, фотографии и истории. Всё хранится в файле на вашем устройстве — без регистрации, серверов и интернета.',
    create: 'Создать новое древо',
    open: 'Открыть файл древа',
    soon: 'Появится в следующей версии',
  },
  features: {
    privateTitle: 'Только у вас',
    privateText: 'Данные не уходят в интернет. Файл древа можно защитить паролем.',
    printTitle: 'Печать на листах',
    printText: 'Большое древо печатается на A4 или A3 и склеивается в один плакат.',
    kinshipTitle: 'Кем приходится',
    kinshipText: 'Выберите двух людей — KinMap назовёт родство: деверь, золовка, сват.',
    gedcomTitle: 'GEDCOM',
    gedcomText: 'Перенос древа из MyHeritage, Geni, Gramps и обратно.',
  },
  footer: {
    version: 'Версия {{version}}',
    license: 'Открытый код, лицензия MIT',
  },
};

// Тип словаря: те же ключи, но любые строки (для английского и будущих языков)
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> };
export type Dictionary = Widen<typeof ru>;
