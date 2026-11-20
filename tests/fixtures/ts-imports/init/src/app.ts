import { helper } from "./util";
import { Widget } from "./widgets";
import { greet } from "@lib/greet";
import { Button } from "@fx/ui/button";
import { mainUi } from "@fx/ui";
import { nope } from "./missing";
import React from "react";

export function run() {
  return [helper(), Widget(), greet("x"), Button(), mainUi(), nope, React];
}
