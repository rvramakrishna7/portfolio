#!/usr/bin/env node
import readline from "node:readline";
import { scrypt, randomBytes } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt);

const DEFAULT_N = 16384;
const DEFAULT_R = 8;
const DEFAULT_P = 1;
const KEY_LEN = 32;

async function hashPassword(plain) {
  const salt = randomBytes(16);
  const derivedKey = await scryptAsync(plain, salt, KEY_LEN, {
    cost: DEFAULT_N,
    blockSize: DEFAULT_R,
    parallelization: DEFAULT_P,
    maxmem: 64 * 1024 * 1024,
  });

  return `scrypt$${DEFAULT_N}$${DEFAULT_R}$${DEFAULT_P}$${salt.toString("base64")}$${derivedKey.toString("base64")}`;
}

function promptHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    if (process.stdin.isTTY) {
      process.stdout.write(question);
      let password = "";
      process.stdin.setRawMode(true);
      process.stdin.resume();

      const onData = (char) => {
        const s = char.toString("utf8");
        if (s === "\n" || s === "\r" || s === "\u0004") {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener("data", onData);
          process.stdout.write("\n");
          rl.close();
          resolve(password);
        } else if (s === "\u0003") {
          // Ctrl+C
          process.exit(1);
        } else if (s === "\b" || s === "\x7f") {
          // Backspace
          if (password.length > 0) {
            password = password.slice(0, -1);
          }
        } else {
          password += s;
        }
      };

      process.stdin.on("data", onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

async function main() {
  const password = await promptHidden("Enter password to hash: ");
  if (!password) {
    console.error("Password cannot be empty.");
    process.exit(1);
  }

  const hash = await hashPassword(password);
  console.log(hash);
}

main().catch((err) => {
  console.error("Error generating hash:", err);
  process.exit(1);
});
