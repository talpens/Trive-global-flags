import { countries } from '../data/countries';
import { israelLocations } from '../data/israel';
import { Question, GameStage } from '../types';

function shuffle<T>(array: T[]): T[] {
  return [...array].sort(() => Math.random() - 0.5);
}

export function generateQuestions(stage: GameStage, localCountry?: string, targetCountryCodes?: string[]): Question[] {
  let questions: Question[] = [];

  if (stage === GameStage.COUNTRIES || stage === GameStage.KNOWLEDGE_GAP) {
    const source = targetCountryCodes 
      ? countries.filter(c => targetCountryCodes.includes(c.code))
      : countries;

    questions = source.map(c => {
      const options = shuffle([
        c.hebrewName,
        ...shuffle(countries.filter(x => x.code !== c.code).map(x => x.hebrewName)).slice(0, 3)
      ]);
      return {
        id: `flag-${c.code}`,
        type: stage === GameStage.KNOWLEDGE_GAP ? 'gap' : 'flag',
        image: `https://flagcdn.com/w320/${c.code}.png`,
        text: stage === GameStage.KNOWLEDGE_GAP ? `חיזוק זיכרון: זהה את המדינה` : 'זהה את המדינה לפי הדגל:',
        options,
        correctAnswer: c.hebrewName,
        countryCode: c.code
      };
    });
  } else if (stage === GameStage.CAPITALS) {
    questions = countries.map(c => {
      const options = shuffle([
        c.hebrewCapital,
        ...shuffle(countries.filter(x => x.code !== c.code).map(x => x.hebrewCapital)).slice(0, 3)
      ]);
      return {
        id: `capital-${c.code}`,
        type: 'capital',
        image: `https://flagcdn.com/w320/${c.code}.png`,
        text: `מהי עיר הבירה של ${c.hebrewName}?`,
        options,
        correctAnswer: c.hebrewCapital
      };
    });
  } else if (stage === GameStage.SUBURBS) {
    // Placeholder for suburbs - using some international cities for now
    const suburbs = [
      { name: "Brooklyn", hebrewName: "ברוקלין", parent: "New York" },
      { name: "Shinjuku", hebrewName: "שינג'וקו", parent: "Tokyo" },
      { name: "Camden", hebrewName: "קמדן", parent: "London" },
      { name: "Montmartre", hebrewName: "מונמארטר", parent: "Paris" },
      { name: "Kreuzberg", hebrewName: "קרויצברג", parent: "Berlin" },
      { name: "Ipanema", hebrewName: "איפנמה", parent: "Rio de Janeiro" },
      { name: "Bondi", hebrewName: "בונדאי", parent: "Sydney" },
      { name: "Gangnam", hebrewName: "גנגנאם", parent: "Seoul" },
    ];
    questions = suburbs.map(s => {
      const options = shuffle([
        s.parent,
        "Los Angeles", "Rome", "Moscow", "Beijing", "Madrid", "Toronto"
      ]).slice(0, 4);
      if (!options.includes(s.parent)) options[0] = s.parent;
      return {
        id: `suburb-${s.name}`,
        type: 'suburb',
        text: `באיזו עיר נמצא הפרוור/שכונה ${s.hebrewName}?`,
        options: shuffle(options),
        correctAnswer: s.parent
      };
    });
  } else if (stage === GameStage.LOCAL_MODE && localCountry === 'ישראל') {
    questions = israelLocations.map(loc => {
      let text = '';
      let options: string[] = [];
      
      if (loc.type === 'region') {
        text = `זהה את חבל הארץ/מחוז: ${loc.name}`;
        options = shuffle([loc.name, "הגליל", "הנגב", "המרכז", "השרון"]).slice(0, 4);
      } else if (loc.type === 'city') {
        text = `האם ${loc.name} היא עיר בישראל?`;
        options = ["כן", "לא", "אולי", "זו מועצה אזורית"];
      } else {
        text = `זהה את היישוב/קיבוץ: ${loc.name}`;
        options = shuffle([loc.name, "עין גדי", "דגניה", "חצרים", "בארי"]).slice(0, 4);
      }

      if (!options.includes(loc.name) && loc.type !== 'city') options[0] = loc.name;

      return {
        id: `israel-${loc.name}`,
        type: 'local',
        text,
        options: loc.type === 'city' ? options : shuffle(options),
        correctAnswer: loc.type === 'city' ? "כן" : loc.name
      };
    });
  }

  return shuffle(questions);
}
