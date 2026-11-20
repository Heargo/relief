import { exported } from "./b";

export function runC() {
  return helper(exported());
}
