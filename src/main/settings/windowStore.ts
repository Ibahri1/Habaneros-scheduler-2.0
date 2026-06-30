import fs from "node:fs";
import { WindowBounds } from "../../shared/types";
import { getDataDirectory, getWindowSettingsPath } from "../database/database";

interface StoreShape {
  windowBounds: WindowBounds;
}

const defaults: StoreShape = {
  windowBounds: { width: 1280, height: 820 }
};

function readStore(): StoreShape {
  try {
    const file = getWindowSettingsPath();
    if (!fs.existsSync(file)) return defaults;
    return { ...defaults, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {
    return defaults;
  }
}

function writeStore(data: StoreShape): void {
  fs.mkdirSync(getDataDirectory(), { recursive: true });
  fs.writeFileSync(getWindowSettingsPath(), JSON.stringify(data, null, 2), "utf8");
}

export const windowStore = {
  get(key: keyof StoreShape): StoreShape[typeof key] {
    return readStore()[key];
  },
  set(key: keyof StoreShape, value: StoreShape[typeof key]): void {
    writeStore({ ...readStore(), [key]: value });
  }
};
