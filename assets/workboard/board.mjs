import fs from 'node:fs';
import {update, readState, summarize} from './store.mjs';

const [type, ...args] = process.argv.slice(2);
try {
  if (type === 'show') { console.log(JSON.stringify(readState(), null, 2)); }
  else if (type === 'summary') {
    const flags = {};
    for (let i = 0; i < args.length; i += 2) {
      if (!['--project', '--lang'].includes(args[i]) || args[i + 1] === undefined) {
        throw new Error('Use: summary [--project ID] [--lang en|zh]');
      }
      flags[args[i].slice(2)] = args[i + 1];
    }
    process.stdout.write(summarize(readState(), flags.project, flags.lang || 'en'));
  }
  else if (type === 'apply') {
    const source = args[0] ? fs.readFileSync(args[0], 'utf8') : fs.readFileSync(0, 'utf8');
    const commands = JSON.parse(source.replace(/^\uFEFF/, ''));
    // A JSON array is applied in order. Each command is an atomic update.
    for (const command of Array.isArray(commands) ? commands : [commands]) console.log(JSON.stringify(await update(command)));
  } else if (['project', 'task', 'note', 'archive', 'unarchive'].includes(type)) {
    // unarchive is archive with the flag turned off, so the CLI reads as the verb it is.
    const command = type === 'unarchive' ? {type: 'archive', archived: 'false'} : {type};
    for (let i = 0; i < args.length; i += 2) {
      if (!/^--[a-z]+(-[a-z]+)*$/.test(args[i]) || args[i + 1] === undefined) throw new Error('Use --name value pairs.');
      // --title-zh reaches the store as titleZh, so the CLI keeps its flag style.
      const key = args[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      command[key] = args[i + 1];
    }
    console.log(JSON.stringify(await update(command)));
  } else {
    console.log('Agent Workboard\n  node board.mjs project --project my-task --title "Task title" --goal "User goal"\n  node board.mjs task --project my-task --id inspect --title "Inspect project" --status doing --note "Reading startup instructions" --actor Codex\n  node board.mjs task --project my-task --id inspect --status done --evidence "Verified startup against package.json" --actor Codex\n  node board.mjs note --project my-task --note "Plan changed because..." --actor Codex\n  node board.mjs archive --project my-task\n  node board.mjs apply commands.json\n  node board.mjs show');
    if (type && type !== '--help') process.exitCode = 1;
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
