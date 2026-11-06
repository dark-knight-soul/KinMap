# Узбекские термины родства — на проверку / Oʻzbekcha qarindoshlik atamalari — tekshirish uchun

KinMap называет родство по-узбекски (латиница). Термины составлены по словарям **без носителя языка** —
пожалуйста, отметьте ошибки и предложите правильный вариант (в Issue на GitHub или прямо в этом файле).

Atamalar lugʻatlar asosida tuzilgan. Xato boʻlsa, toʻgʻri variantni yozing (GitHub Issue yoki shu faylda).

Код: [`src/model/kinshipUz.ts`](../src/model/kinshipUz.ts), тесты: [`src/model/kinshipUz.test.ts`](../src/model/kinshipUz.test.ts).

Вопрос всегда: **кем B приходится A** (B — A ga kim boʻladi).

## Кровное родство / Qon-qarindoshlik

| Кто B для A | По-русски | Предложено (uz) | Верно? / Toʻgʻrimi? |
|---|---|---|---|
| отец / мать | отец, мать | ota, ona | |
| дедушка / бабушка | дедушка, бабушка | bobo, buvi | |
| прадедушка / прабабушка | прадедушка | katta bobo, katta buvi | ❓ «bobokalon»? |
| прапрадед и дальше | прапрадедушка | 4-avlod ajdodi | ❓ |
| сын / дочь | сын, дочь | oʻgʻil, qiz | |
| внук / внучка | внук | nevara | ❓ «nabira»? |
| правнук | правнук | chevara | |
| праправнук | праправнук | evara | ❓ |
| старший брат / младший брат | брат | aka / uka | |
| старшая сестра / младшая сестра | сестра | opa / singil | |
| брат/сестра по отцу (неполнородные) | единокровный брат | uka (ota bir) | ❓ |
| брат / сестра отца | дядя, тётя | amaki, amma | |
| брат / сестра матери | дядя, тётя | togʻa, xola | |
| ребёнок брата или сестры | племянник, племянница | jiyan | |
| дети amaki / amma / togʻa / xola | двоюродные | amakivachcha, ammavachcha, togʻavachcha, xolavachcha | |
| брат деда и т.п. | двоюродный дедушка | описанием: «otasining amakisi» | ❓ «bobo»? |

## Через брак / Nikoh orqali

| Кто B для A | По-русски | Предложено (uz) | Верно? / Toʻgʻrimi? |
|---|---|---|---|
| муж / жена | муж, жена | er, xotin | |
| бывший муж / жена | бывший муж | sobiq er, sobiq xotin | |
| отец / мать супруга | тесть, свёкор / тёща, свекровь | qaynota, qaynona | |
| старший / младший брат супруга | шурин, деверь | qaynagʻa / qaynini | ❓ |
| старшая / младшая сестра супруга | свояченица, золовка | qaynopa / qaynsingil | ❓ |
| муж дочери | зять | kuyov | |
| жена сына | невестка | kelin | |
| жена старшего брата | невестка | kelinoyi | ❓ «yanga»? |
| жена младшего брата | невестка | kelin | |
| муж старшей сестры | зять | pochcha | |
| муж младшей сестры | зять | kuyov | ❓ |
| родители супруга ребёнка | сват, сватья | quda, qudagʻay | |
| мужья сестёр друг другу | свояк | boja | |
| жёны братьев друг другу | ятровка | ovsin | |
| отчим / мачеха | отчим, мачеха | oʻgay ota, oʻgay ona | |
| пасынок / падчерица | пасынок | oʻgay oʻgʻil, oʻgay qiz | |
| сводный брат / сестра | сводный брат | oʻgay aka/uka, oʻgay opa/singil | |
| приёмный отец / приёмный сын | приёмный | asrab olgan ota / asrandi oʻgʻil | |

## Описания / Tavsiflar

Если точного слова нет, KinMap строит цепочку с притяжательными окончаниями:

- жена брата матери → **togʻasining xotini**
- сын младшего брата жены → **xotinining ukasining oʻgʻli**
- брат деда по отцу → **otasining amakisi**

Правильны ли окончания (‑si / ‑i, ‑ning), и звучит ли это естественно?

## Даты / Sanalar

| Смысл | Вывод | Можно вводить и так |
|---|---|---|
| около 1950 | taxm. 1950 | taxminan 1950 |
| до 1920 | 1920 gacha | 1920-yilgacha |
| после 1945 | 1945 dan keyin | 1945 dan soʻng |
| между 1900 и 1905 | 1900 va 1905 oraligʻida | |
| 12 марта 1950 | 12.03.1950 | 12 mart 1950 |
