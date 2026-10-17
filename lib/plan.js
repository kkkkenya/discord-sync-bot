// Study Hub Milestones year plan: 12 months per track, each with a daily task and free links. The bot posts today's
// tasks every morning (lib/daily.js), /today and /plan show them (lib/logbook.js), and the board page lists the year.
// Weekdays follow the month's daily task; Saturday is catch-up or project day, Sunday is review day.
import { CYCLE, TRACK, dayNum } from './milestones.js';

export const LINKS = {
  academy: ['Anthropic Academy', 'https://anthropic.skilljar.com/'],
  ccia: ['Claude Code in Action', 'https://anthropic.skilljar.com/claude-code-in-action'],
  gitb: ['Learn Git Branching', 'https://learngitbranching.js.org/'],
  cs50: ['CS50x (Harvard)', 'https://cs50.harvard.edu/x/'],
  fso0: ['Full Stack Open, part 0', 'https://fullstackopen.com/en/part0'],
  fso1: ['Full Stack Open, part 1', 'https://fullstackopen.com/en/part1'],
  fso2: ['Full Stack Open, part 2', 'https://fullstackopen.com/en/part2'],
  fso3: ['Full Stack Open, part 3', 'https://fullstackopen.com/en/part3'],
  fso4: ['Full Stack Open, part 4', 'https://fullstackopen.com/en/part4'],
  fso5: ['Full Stack Open, part 5', 'https://fullstackopen.com/en/part5'],
  fcc: ['freeCodeCamp', 'https://www.freecodecamp.org/learn'],
  mdn: ['MDN Learn web development', 'https://developer.mozilla.org/en-US/docs/Learn_web_development'],
  gh: ['GitHub Pages', 'https://pages.github.com/'],
  matlab: ['MATLAB Onramps', 'https://matlabacademy.mathworks.com/'],
  sw: ['SOLIDWORKS for students', 'https://www.solidworks.com/product/students'],
  onshape: ['Onshape Education', 'https://www.onshape.com/en/education/'],
  kicad: ['KiCad docs', 'https://docs.kicad.org/'],
  netacad: ['Cisco NetAcad: Introduction to IoT', 'https://www.netacad.com/'],
  wokwi: ['Wokwi simulator', 'https://wokwi.com/'],
  rnt: ['Random Nerd Tutorials (ESP32)', 'https://randomnerdtutorials.com/'],
  mqtt: ['HiveMQ MQTT Essentials', 'https://www.hivemq.com/mqtt/'],
  thingspeak: ['ThingSpeak', 'https://thingspeak.mathworks.com/'],
  nodered: ['Node-RED', 'https://nodered.org/'],
  edge: ['Edge Impulse', 'https://edgeimpulse.com/'],
  hubspot: ['HubSpot Academy', 'https://academy.hubspot.com/'],
  ajira: ['Ajira Digital', 'https://ajiradigital.go.ke/'],
  nego: ['Successful Negotiation (Coursera, free to audit)', 'https://www.coursera.org/learn/negotiation-skills'],
  duo: ['Duolingo', 'https://www.duolingo.com/'],
  hello: ['HelloChinese', 'https://www.hellochinese.cc/'],
  pleco: ['Pleco dictionary', 'https://www.pleco.com/'],
  anki: ['AnkiWeb shared decks (search HSK)', 'https://ankiweb.net/shared/decks'],
  mc: ['Mandarin Corner (YouTube)', 'https://www.youtube.com/results?search_query=mandarin+corner'],
};

// [month title, weekday task, link keys, milestone ticked at the end of the month]
export const PLAN = {
  ai: [
    ['Claude Code basics', 'One lesson of Claude Code 101, then use Claude Code on one small real task (a script, a README fix).', ['academy'], 'ai1'],
    ['Claude Code in Action', 'One section of Claude Code in Action, then try it in your own repo (plan mode, a CLAUDE.md, a hook).', ['ccia'], 'ai2'],
    ['Git and tests', 'Two Learn Git Branching levels, then have Claude write a failing test first and make it pass. Commit it.', ['gitb'], 'ai3'],
    ['Skills and subagents', 'One lesson of the agent skills or subagents course, then write or improve one skill for your own work.', ['academy'], 'ai4'],
    ['The Claude API', 'One lesson of Building with the Claude API, then call the API from a small script of yours.', ['academy'], 'ai5'],
    ['Connect tools (MCP)', 'One lesson of Introduction to Model Context Protocol, then connect Claude to one tool you use.', ['academy'], null],
    ['Build your AI tool', 'Ship one small feature of an AI tool for a real person. Log what changed.', ['academy'], null],
    ['Get a real user', 'Put your tool in front of one person, watch them use it, fix the first thing they hit.', [], 'ai6'],
    ['Automate the boring parts', 'Add one automation: a GitHub Action, a scheduled run, or a code-review step.', ['ccia'], null],
    ['AI fluency', 'One lesson of AI Fluency, then check one AI answer from your week against a real source.', ['academy'], null],
    ['Teach it', 'Write or record one short tip for the server about something you learned this year.', [], null],
    ['Portfolio', 'Polish one project: README, screenshots, a 1-minute demo video.', [], null],
  ],
  sw: [
    ['Git and CS50 week 0', 'Two Learn Git Branching levels, or one part of the CS50 week 0 lecture and its problem.', ['gitb', 'cs50'], 'sw1'],
    ['CS50 weeks 1 to 2 (C)', 'Watch 30 minutes of the current CS50 lecture or work on its problem set.', ['cs50'], null],
    ['CS50 weeks 3 to 5', 'Algorithms, memory, data structures: 30 minutes of lecture or problem set.', ['cs50'], 'sw2'],
    ['CS50 weeks 6 to 7 (Python, SQL)', '30 minutes of lecture or problem set. Redo one old C problem in Python.', ['cs50'], null],
    ['CS50 final weeks and project', 'Finish the last lectures, then one step of your final project a day.', ['cs50'], 'sw3'],
    ['Web basics and React', 'One section of Full Stack Open parts 0 and 1, exercises included.', ['fso0', 'fso1', 'mdn'], null],
    ['Servers with Node', 'One section of Full Stack Open parts 2 and 3, exercises included.', ['fso2', 'fso3'], null],
    ['Testing and login', 'One section of Full Stack Open parts 4 and 5, exercises included.', ['fso4', 'fso5'], 'sw4'],
    ['JavaScript algorithms', 'Three freeCodeCamp JavaScript challenges.', ['fcc'], 'sw5'],
    ['Portfolio site', 'Build one section of your portfolio site and deploy it.', ['gh', 'mdn'], 'sw6'],
    ['A full-stack app', 'One feature of a full-stack app that solves a problem you or a classmate has.', ['fso3'], null],
    ['Ship and write it up', 'Fix one bug, then write one paragraph of the project write-up.', [], null],
  ],
  eng: [
    ['MATLAB Onramp', 'One MATLAB Onramp module (about 15 minutes), then redo the exercise with numbers from your coursework.', ['matlab'], 'e1'],
    ['Simulink', 'One Simulink Onramp module, then model one small system from class (a spring, a circuit, a tank).', ['matlab'], 'e2'],
    ['Data and machine learning', 'One module of the Machine Learning or Signal Processing Onramp.', ['matlab'], 'e3'],
    ['CAD sketches and parts', 'One CAD tutorial, then model one part from your coursework or around you.', ['onshape', 'sw'], null],
    ['Assemblies and drawings', 'Add one part to an assembly or make one engineering drawing with dimensions.', ['onshape', 'sw'], 'e4'],
    ['Simulate it', 'One simulation step: a load case in CAD, or a MATLAB model of a coursework problem.', ['matlab', 'sw'], null],
    ['CSWA practice', 'One CSWA-style practice question under time. Note what slowed you down.', ['sw'], null],
    ['CSWA exam month', 'One timed practice part, then sit the CSWA when you are ready.', ['sw'], 'e5'],
    ['KiCad schematics', 'One KiCad tutorial step, then draw part of a schematic for a circuit you know.', ['kicad'], null],
    ['KiCad PCB layout', 'Lay out part of a board in KiCad: placement, then routing.', ['kicad'], 'e6'],
    ['One full project', 'Move one engineering project forward: model, simulate or draw one piece of it.', ['matlab', 'onshape'], null],
    ['Portfolio', 'Turn one project into a one-page case study with images.', [], null],
  ],
  iot: [
    ['Introduction to IoT', 'One module of the Cisco Introduction to IoT course, then blink an LED on an ESP32 in Wokwi.', ['netacad', 'wokwi'], 'i1'],
    ['Sensors in the simulator', 'Wire one sensor in Wokwi (DHT22, ultrasonic, PIR) and print its readings.', ['wokwi', 'rnt'], 'i2'],
    ['A real ESP32 on Wi-Fi', 'One Random Nerd Tutorials ESP32 project step: Wi-Fi, a web server, a real sensor.', ['rnt'], null],
    ['MQTT', 'One chapter of MQTT Essentials, then publish one sensor reading to a broker.', ['mqtt', 'rnt'], 'i3'],
    ['Dashboards', 'Send data to ThingSpeak or Node-RED and add one chart or gauge.', ['thingspeak', 'nodered'], 'i4'],
    ['Alerts', 'Make one alert work: Telegram, email or a buzzer when a value crosses a limit.', ['nodered', 'rnt'], null],
    ['Power and batteries', 'Try one power saver: deep sleep, a battery reading, a longer send interval.', ['rnt'], null],
    ['Tiny machine learning', 'One Edge Impulse tutorial step: collect, train or deploy a small model.', ['edge'], null],
    ['Field prototype', 'Move your prototype one step closer to working outside: mount it, seal it, test it for an hour.', [], 'i5'],
    ['Board design', 'One KiCad step for your project board: schematic, footprints or layout.', ['kicad'], null],
    ['Enclosure and reliability', 'Design or print one enclosure part, or fix one thing that failed in testing.', ['onshape'], 'i6'],
    ['Showcase', 'Record one demo clip or write one section of your project write-up.', [], null],
  ],
  biz: [
    ['Sales basics', 'One HubSpot Academy Inbound Sales lesson. Write one line about who you want to serve.', ['hubspot'], null],
    ['Niche and offer', 'Refine your one-line niche or one of your three packages (scope, time, price).', ['hubspot'], 'b1'],
    ['Case studies', 'Write one part of a case study: problem, what you built, the result in numbers.', [], 'b2'],
    ['Portfolio and profile', 'Improve one thing: your portfolio page, LinkedIn headline, or a project screenshot.', [], null],
    ['Warm outreach', 'Send 3 personal messages to people you know who might need your skills.', ['ajira'], 'b3'],
    ['Discovery calls', 'Book or hold one call. Ask what the problem costs them, who decides, the budget, the deadline.', ['hubspot'], 'b4'],
    ['Proposals and pricing', 'One lesson of Successful Negotiation, or draft one proposal with three options.', ['nego'], null],
    ['Deliver well', 'One task for a client, then send them a short progress update.', [], null],
    ['Retainers', 'Offer one client a monthly maintenance plan, or improve the plan you offer.', [], 'b5'],
    ['Referrals and testimonials', 'Ask one happy client for a testimonial or an introduction.', [], null],
    ['Show your work', 'Post one thing you built or learned where clients will see it.', [], null],
    ['Review the year', 'Write down one lesson from this year and one goal for next year.', [], 'b6'],
  ],
  cn: [
    ['Pinyin and tones', '15 minutes on Duolingo or HelloChinese, then say 10 tone pairs out loud.', ['duo', 'hello'], 'c1'],
    ['HSK 1 words 1 to 75', 'Learn 5 new HSK 1 words in Anki and review the old ones. Look each up in Pleco.', ['anki', 'pleco'], null],
    ['HSK 1 words 76 to 150', '5 new HSK 1 words plus Anki reviews. Write one sentence with a new word.', ['anki', 'pleco'], 'c2'],
    ['Introduce yourself', 'Practise one line of a 2-minute self-introduction out loud and record it.', ['hello'], 'c3'],
    ['HSK 2 words 151 to 225', '5 new HSK 2 words plus Anki reviews.', ['anki', 'pleco'], null],
    ['HSK 2 words 226 to 300', '5 new HSK 2 words plus Anki reviews. Read one short text in HelloChinese.', ['anki', 'hello'], 'c4'],
    ['Listening', '10 minutes of Mandarin Corner with Chinese subtitles, then Anki reviews.', ['mc', 'anki'], null],
    ['Conversation', 'One 10-minute talk with a speaker or a recorded monologue, then Anki reviews.', ['mc'], 'c5'],
    ['HSK 3 words 301 to 450', '5 new HSK 3 words plus Anki reviews.', ['anki', 'pleco'], null],
    ['HSK 3 words 451 to 600', '5 new HSK 3 words plus Anki reviews.', ['anki', 'pleco'], 'c6'],
    ['Mock tests', 'One section of an HSK practice test under time.', ['anki'], null],
    ['Exam month', 'One timed practice section, then sit the HSK exam (ask the KU Confucius Institute for dates).', [], 'c7'],
  ],
};

const DAYS_PER_MONTH = CYCLE.days / 12;
// Month 1 to 12 of the cycle for a Nairobi date, or 0 before the start.
export const monthOf = (day) => { const n = dayNum(day); return n < 1 ? 0 : Math.min(12, Math.floor((n - 1) / DAYS_PER_MONTH) + 1); };
const weekday = (day) => new Date(`${day}T12:00:00+03:00`).getUTCDay(); // 0 Sunday … 6 Saturday

// Today's task for one track. Own interests (and "My field") get a general task.
export function taskFor(track, day, name) {
  const m = Math.max(1, monthOf(day));
  const unit = PLAN[track]?.[m - 1];
  const label = name || TRACK[track]?.name || track;
  const wd = weekday(day);
  if (!unit) {
    const text = wd === 0 ? 'Review the week and pick next week\'s goal.' : `30 to 60 minutes on ${label}. Log what you finished.`;
    return { track, label, month: m, title: label, text, daily: `30 to 60 minutes on ${label}. Log what you finished.`, weekend: wd === 0 || wd === 6, links: [] };
  }
  const [title, daily, keys, ms] = unit;
  const text = wd === 6 ? `Catch-up or project day: finish anything you skipped this week, or build something with it. (Weekday task: ${daily})`
    : wd === 0 ? 'Review day: redo one exercise from this week, tick any milestone you reached, plan next week.'
      : daily;
  return { track, label, month: m, title, text, daily, weekend: wd === 0 || wd === 6, links: keys.map((k) => LINKS[k]), milestone: ms };
}

// The board page and /plan read the plan as plain data.
export const planData = () => Object.fromEntries(Object.entries(PLAN).map(([t, units]) => [t, units.map(([title, daily, keys, ms]) => ({ title, daily, links: keys.map((k) => LINKS[k]), milestone: ms }))]));
