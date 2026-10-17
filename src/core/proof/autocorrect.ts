// AutoCorrect: a short list of typos that are never intended, fixed when the word is finished.
// The same list also puts the right word first in the spelling suggestions.
import { matchCase } from './words';

const PAIRS = `
teh the|adn and|nad and|taht that|thier their|theyre they're|thats that's|whats what's|wich which|whihc which|hte the
recieve receive|recieved received|reciever receiver|recieving receiving|reciept receipt|definately definitely|definatly definitely
definitly definitely|seperate separate|seperated separated|seperately separately|occured occurred|occuring occurring|occurence occurrence
occurences occurrences|occassion occasion|occassionally occasionally|untill until|beleive believe|beleived believed|becuase because
becasue because|beacuse because|acheive achieve|acheived achieved|accomodate accommodate|accomodation accommodation|wierd weird
freind friend|freinds friends|goverment government|governement government|enviroment environment|enviromental environmental
tommorow tomorrow|tomorow tomorrow|tomorrrow tomorrow|begining beginning|beggining beginning|existance existence|neccessary necessary
necesary necessary|necessery necessary|calender calendar|collegue colleague|comming coming|commited committed|concious conscious
dissapear disappear|dissapoint disappoint|dissapointed disappointed|embarass embarrass|embarassed embarrassed|embarassing embarrassing
foriegn foreign|fourty forty|gaurd guard|happend happened|harrass harass|immediatly immediately|independant independent
knowlege knowledge|liason liaison|lenght length|maintainance maintenance|mispell misspell|noticable noticeable|persistant persistent
posession possession|prefered preferred|publically publicly|realy really|refered referred|relevent relevant|rythm rhythm|sieze seize
succesful successful|successfull successful|succesfully successfully|supercede supersede|tounge tongue|truely truly|unfortunatly unfortunately
vaccuum vacuum|yesturday yesterday|alot a lot|aswell as well|incase in case|infact in fact|eachother each other|adress address|adresses addresses
agressive aggressive|apparant apparent|apparantly apparently|arguement argument|assasination assassination|basicly basically|buisness business
carribean Caribbean|catagory category|cemetary cemetery|changable changeable|cheif chief|collaegue colleague|completly completely
concensus consensus|copywrite copyright|critisism criticism|decison decision|desparate desperate|diffrent different|diffrence difference
dilema dilemma|dosent doesn't|doesnt doesn't|dont don't|didnt didn't|isnt isn't|wasnt wasn't|werent weren't|arent aren't|havent haven't
hasnt hasn't|hadnt hadn't|wouldnt wouldn't|couldnt couldn't|shouldnt shouldn't|youre you're|theyve they've|youve you've|weve we've
embarrasing embarrassing|excellant excellent|exagerate exaggerate|familar familiar|finaly finally|florescent fluorescent|fullfil fulfil
gratefull grateful|greatful grateful|guidence guidance|heigth height|hieght height|hygeine hygiene|ignorence ignorance
imediately immediately|incidently incidentally|intresting interesting|interupt interrupt|irresistable irresistible|judgement judgment
konw know|lazer laser|maintenence maintenance|millenium millennium|miniscule minuscule
mischievious mischievous|neccesary necessary|neice niece|ocasion occasion|occurrance occurrence|offical official
oppurtunity opportunity|orginal original|paralell parallel|parliment parliament|pavillion pavilion|peice piece|perseverence perseverance
personel personnel|playwrite playwright|politican politician|presense presence|priviledge privilege|probaly probably
probly probably|proffesional professional|profesional professional|promiss promise|pronounciation pronunciation|questionaire questionnaire
recomend recommend|recomendation recommendation|reccomend recommend|religous religious|remeber remember|resistence resistance|responsability responsibility
restaraunt restaurant|resturant restaurant|scedule schedule|secratary secretary|sentance sentence|similiar similar|sincerly sincerely
speach speech|strenght strength|stuborn stubborn|suprise surprise|suprised surprised|surpress suppress|temperture temperature|thoroughy thoroughly
tounge tongue|tranlate translate|twelth twelfth|tyrany tyranny|underate underrate|usualy usually|vegatable vegetable
vehical vehicle|visable visible|whereever wherever|wich which|withold withhold|writting writing|writen written|youself yourself
`;

const TABLE = new Map<string, string>();
for (const pair of PAIRS.split('|')) {
  for (const entry of pair.split('\n')) {
    const t = entry.trim();
    const i = t.indexOf(' ');
    if (i > 0) TABLE.set(t.slice(0, i), t.slice(i + 1));
  }
}
// words that are real words or ambiguous: never auto-changed (they may still be offered as suggestions elsewhere)
for (const k of ['loose', 'quiet', 'prefer', 'wether', 'tomatos', 'incase', 'cant', 'wont', 'ill', 'were', 'well', 'fullfil', 'judgement', 'lisence']) TABLE.delete(k);

/** The corrected form of a typo (with the same capitalisation), or null when the word is fine / unknown. */
export function autocorrectWord(word: string): string | null {
  const fixed = TABLE.get(word.toLowerCase());
  if (!fixed) return null;
  return matchCase(word, fixed);
}

/** The correction as a spelling suggestion (also for words autocorrect leaves alone). */
export function knownTypo(word: string): string | null {
  return autocorrectWord(word);
}

/** "i", "i'm", "i'll", "i've", "i'd" typed in lower case. */
export function capitalizeI(word: string): string | null {
  return /^i(?:['’](?:m|ll|ve|d))?$/.test(word) ? 'I' + word.slice(1) : null;
}
