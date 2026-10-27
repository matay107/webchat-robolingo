/**
 * Prints an ADMIN_PASSWORD_HASH value. The password is read from a hidden prompt
 * (or stdin when piped), never from argv, so it stays out of shell history.
 *
 *   pnpm hash-password
 */
import { hashPassword } from "../src/lib/auth/password";

const MIN_LENGTH = 12; // ASVS V2.1.1
const MAX_LENGTH = 128;

async function readPiped(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").replace(/\r?\n$/, "");
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    let input = "";
    const onData = (data: Buffer) => {
      for (const char of data.toString("utf8")) {
        if (char === "\r" || char === "\n") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(input);
        }
        if (char === "\u0003") process.exit(130); // Ctrl+C
        input = char === "\u007f" ? input.slice(0, -1) : input + char;
      }
    };
    process.stdin.on("data", onData);
  });
}

async function main() {
  const password = process.stdin.isTTY ? await promptHidden("Admin password: ") : await readPiped();
  if (password.length < MIN_LENGTH || password.length > MAX_LENGTH) {
    console.error(`Password must be ${MIN_LENGTH}-${MAX_LENGTH} characters.`);
    process.exit(1);
  }
  console.log(await hashPassword(password));
}

void main();
