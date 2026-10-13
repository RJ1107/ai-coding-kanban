import fs from 'node:fs';
import {update, readState, summarize} from './store.mjs';

const [type, ...args] = process.argv.slice(2);
try {
  if (type === 'show') { console.log(JSON.stringify(readState(), null, 2)); }
  else if (type === 'summary') {
    if (args.length && !(args.length === 2 && args[0] === '--project')) throw new Error('Use: summary [--project ID]');
    process.stdout.write(summarize(readState(), args[1]));
  }
  else if (type === 'apply') {
    const source = args[0] ? fs.readFileSync(args[0], 'utf8') : fs.readFileSync(0, 'utf8');
    const commands = JSON.parse(source.replace(/^\uFEFF/, ''));
    // A JSON array is applied in order. Each command is an atomic update.
    for (const command of Array.isArray(commands) ? commands : [commands]) console.log(JSON.stringify(await update(command)));
  } else if (['project', 'task', 'note'].includes(type)) {
    const command = {type};
    for (let i = 0; i < args.length; i += 2) {
      if (!/^--[a-z]+$/.test(args[i]) || args[i + 1] === undefined) throw new Error('Use --name value pairs.');
      command[args[i].slice(2)] = args[i + 1];
    }
    console.log(JSON.stringify(await update(command)));
  } else {
    console.log('Agent Workboard\n  node board.mjs project --project my-task --title "Task title" --goal "User goal"\n  node board.mjs task --project my-task --id inspect --title "Inspect project" --status doing --note "Reading startup instructions" --actor Codex\n  node board.mjs task --project my-task --id inspect --status done --evidence "Verified startup against package.json" --actor Codex\n  node board.mjs note --project my-task --note "Plan changed because..." --actor Codex\n  node board.mjs apply commands.json\n  node board.mjs show');
    if (type && type !== '--help') process.exitCode = 1;
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
