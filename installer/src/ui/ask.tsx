import { render } from "ink";
import type { Answers } from "../answers.ts";
import { Wizard, type WizardProps } from "./Wizard.tsx";

/** Ask the questions in the terminal. Resolves to undefined when cancelled (n on the last screen, or ctrl+c). */
export async function askAnswers(props: Omit<WizardProps, "onDone">): Promise<Answers | undefined> {
  let result: Answers | undefined;
  const app = render(
    <Wizard
      {...props}
      onDone={(a) => {
        result = a;
        app.unmount();
      }}
    />,
  );
  await app.waitUntilExit();
  return result;
}
