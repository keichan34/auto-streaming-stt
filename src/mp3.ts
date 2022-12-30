import { Duplex } from "node:stream";
import { spawn } from 'node:child_process';

export const rawToMp3 = () => {
  const lameProcess = spawn(
    'lame',
    [
      '-r', // expect raw input
      '-s', '48', // 48khz
      '--bitwidth', '16',
      '--signed',
      '--little-endian',
      '-m', 'm', // mono
      '-', // read from stdin
      '-', // output to stdout
    ],
    {
      stdio: ['pipe', 'pipe', 'ignore'],
    },
  );

  return Duplex.from({
    readable: lameProcess.stdout,
    writable: lameProcess.stdin,
  });
}
