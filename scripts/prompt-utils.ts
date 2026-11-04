import readline from 'readline';

/**
 * Prompts the user with a question and returns the trimmed response.
 */
export async function promptText(question: string, defaultValue?: string): Promise<string> {
  const displayQuestion = defaultValue ? `${question} [${defaultValue}]: ` : `${question}: `;
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(displayQuestion, (answer) => {
      rl.close();
      const trimmed = answer.trim();
      resolve(trimmed || defaultValue || '');
    });
  });
}

/**
 * Prompts the user for a password with muted input (no characters echoed to stdout).
 * Falls back to standard line reading if running non-interactively (e.g., in CI or piped input).
 */
export async function promptPassword(question: string): Promise<string> {
  const displayQuestion = `${question}: `;

  if (!process.stdin.isTTY) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    return new Promise((resolve) => {
      rl.question(displayQuestion, (answer) => {
        rl.close();
        resolve(answer.trim());
      });
    });
  }

  return new Promise((resolve) => {
    process.stdout.write(displayQuestion);
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');

    let password = '';

    const onData = (char: string) => {
      // Enter key (Carriage Return or Line Feed)
      if (char === '\n' || char === '\r' || char === '\u0004') {
        stdin.setRawMode(wasRaw || false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        resolve(password);
      } else if (char === '\u0003') {
        // Ctrl+C: Cancel
        stdin.setRawMode(wasRaw || false);
        stdin.pause();
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        process.exit(130);
      } else if (char === '\u0008' || char === '\x7f') {
        // Backspace
        if (password.length > 0) {
          password = password.slice(0, -1);
        }
      } else {
        password += char;
      }
    };

    stdin.on('data', onData);
  });
}

/**
 * Common format validators
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function isValidPassword(password: string): { valid: boolean; reason?: string } {
  if (!password || password.length < 8) {
    return { valid: false, reason: 'Password must be at least 8 characters long.' };
  }
  return { valid: true };
}

