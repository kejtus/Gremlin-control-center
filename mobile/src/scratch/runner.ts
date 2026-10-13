/** Open-loop runner skryptu Scratch → napęd / dźwięk / zmienne / komponenty. */

import {
  type ScratchDeviceId,
  type ScratchNode,
  type ScratchProcedure,
  type ScratchProgram,
} from './blocks';
import { soundControlPath } from '../protocol';

export type ScratchRunnerApi = {
  drive: (x: number, y: number, omega?: number) => void;
  stop: () => void;
  playSound: (file: string, volume?: number) => void;
  stopSound: () => void;
  setDevicePower: (device: ScratchDeviceId, enabled: boolean) => void;
  isDeviceOn: (device: ScratchDeviceId) => boolean;
  getBatteryPct: () => number;
};

export type ScratchRunnerHandle = {
  stop: () => void;
  done: Promise<void>;
};

function sleep(ms: number, isStopped: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const tick = () => {
      if (isStopped() || Date.now() - t0 >= ms) {
        resolve();
        return;
      }
      setTimeout(tick, 40);
    };
    setTimeout(tick, Math.min(40, ms));
  });
}

function power01(node: ScratchNode): number {
  const p = node.fields.powerPct ?? 35;
  return Math.max(0.12, Math.min(1, p / 100));
}

function secMs(node: ScratchNode, fallback = 1): number {
  const s = node.fields.sec ?? fallback;
  return Math.max(50, Math.round(Math.max(0.05, s) * 1000));
}

export function runScratchProgram(
  program: ScratchProgram,
  api: ScratchRunnerApi,
): ScratchRunnerHandle {
  let stopped = false;
  const isStopped = () => stopped;

  const vars = new Map<string, number>();
  for (const v of program.variables) {
    vars.set(v.id, v.value);
    vars.set(v.name, v.value);
  }
  let steps = 0;

  const resolveVarKey = (node: ScratchNode | null | undefined): string | null => {
    if (!node || node.kind !== 'var_reporter') return null;
    if (node.fields.varId) return node.fields.varId;
    if (node.fields.varName) return node.fields.varName.trim();
    return null;
  };

  const getVar = (key: string | null) => {
    if (!key) return 0;
    if (vars.has(key)) return vars.get(key)!;
    const byName = program.variables.find((v) => v.name === key);
    if (byName) return vars.get(byName.id) ?? byName.value;
    return 0;
  };

  const setVar = (key: string | null, value: number) => {
    if (!key) return;
    vars.set(key, value);
    const v = program.variables.find((x) => x.id === key || x.name === key);
    if (v) {
      vars.set(v.id, value);
      vars.set(v.name, value);
    }
  };

  const stop = () => {
    stopped = true;
    api.stop();
    api.stopSound();
  };

  const resolveDevice = (node: ScratchNode | null | undefined): ScratchDeviceId => {
    if (!node) return 'LIDAR';
    if (node.kind === 'device_ref') return (node.fields.device || 'LIDAR') as ScratchDeviceId;
    return 'LIDAR';
  };

  const evalNumber = (node: ScratchNode | null | undefined): number => {
    if (!node) return 0;
    switch (node.kind) {
      case 'number':
        return Number(node.fields.numberValue ?? node.fields.cmpValue ?? 0) || 0;
      case 'var_reporter':
        return getVar(resolveVarKey(node));
      case 'op_add':
        return evalNumber(node.inputs?.a) + evalNumber(node.inputs?.b);
      case 'op_sub':
        return evalNumber(node.inputs?.a) - evalNumber(node.inputs?.b);
      case 'op_mul':
        return evalNumber(node.inputs?.a) * evalNumber(node.inputs?.b);
      case 'op_div': {
        const b = evalNumber(node.inputs?.b);
        return b === 0 ? 0 : evalNumber(node.inputs?.a) / b;
      }
      case 'device_is_on':
        return api.isDeviceOn(resolveDevice(node.inputs?.device)) ? 1 : 0;
      case 'device_is_off':
        return api.isDeviceOn(resolveDevice(node.inputs?.device)) ? 0 : 1;
      case 'op_eq':
        return evalNumber(node.inputs?.a) === evalNumber(node.inputs?.b) ? 1 : 0;
      case 'op_gt':
        return evalNumber(node.inputs?.a) > evalNumber(node.inputs?.b) ? 1 : 0;
      case 'op_lt':
        return evalNumber(node.inputs?.a) < evalNumber(node.inputs?.b) ? 1 : 0;
      case 'op_gte':
        return evalNumber(node.inputs?.a) >= evalNumber(node.inputs?.b) ? 1 : 0;
      case 'op_lte':
        return evalNumber(node.inputs?.a) <= evalNumber(node.inputs?.b) ? 1 : 0;
      default:
        return 0;
    }
  };

  const evalBool = (node: ScratchNode | null | undefined): boolean => {
    if (!node) return false;
    switch (node.kind) {
      case 'device_is_on':
        return api.isDeviceOn(resolveDevice(node.inputs?.device));
      case 'device_is_off':
        return !api.isDeviceOn(resolveDevice(node.inputs?.device));
      case 'op_eq':
        return evalNumber(node.inputs?.a) === evalNumber(node.inputs?.b);
      case 'op_gt':
        return evalNumber(node.inputs?.a) > evalNumber(node.inputs?.b);
      case 'op_lt':
        return evalNumber(node.inputs?.a) < evalNumber(node.inputs?.b);
      case 'op_gte':
        return evalNumber(node.inputs?.a) >= evalNumber(node.inputs?.b);
      case 'op_lte':
        return evalNumber(node.inputs?.a) <= evalNumber(node.inputs?.b);
      default:
        return evalNumber(node) !== 0;
    }
  };

  const runList = async (nodes: ScratchNode[], depth: number) => {
    if (depth > 12) return;
    for (const node of nodes) {
      if (stopped) return;
      await runNode(node, depth);
    }
  };

  const findProc = (id: string | undefined): ScratchProcedure | undefined =>
    program.procedures.find((p) => p.id === id);

  const runNode = async (node: ScratchNode, depth: number) => {
    if (stopped) return;
    switch (node.kind) {
      case 'start':
      case 'end':
        await runList(node.children || [], depth);
        break;
      case 'wait':
        await sleep(secMs(node, 1), isStopped);
        break;
      case 'repeat': {
        const n = Math.max(1, Math.min(50, Math.round(node.fields.times ?? 3)));
        for (let i = 0; i < n; i++) {
          if (stopped) return;
          await runList(node.children || [], depth + 1);
        }
        break;
      }
      case 'forever':
        while (!stopped) {
          await runList(node.children || [], depth + 1);
          await sleep(20, isStopped);
        }
        break;
      case 'while': {
        let guard = 0;
        while (!stopped && evalBool(node.inputs?.condition) && guard++ < 200) {
          await runList(node.children || [], depth + 1);
          await sleep(20, isStopped);
        }
        break;
      }
      case 'if': {
        const ok = evalBool(node.inputs?.condition);
        if (ok) await runList(node.children || [], depth + 1);
        else await runList(node.elseChildren || [], depth + 1);
        break;
      }
      case 'move_forward': {
        const v = power01(node);
        api.drive(0, v, 0);
        await sleep(secMs(node), isStopped);
        api.stop();
        steps += 1;
        void steps;
        break;
      }
      case 'move_back': {
        const v = power01(node);
        api.drive(0, -v, 0);
        await sleep(secMs(node), isStopped);
        api.stop();
        steps += 1;
        break;
      }
      case 'turn_left': {
        const v = power01(node);
        api.drive(0, 0, -v);
        await sleep(secMs(node, 0.8), isStopped);
        api.stop();
        break;
      }
      case 'turn_right': {
        const v = power01(node);
        api.drive(0, 0, v);
        await sleep(secMs(node, 0.8), isStopped);
        api.stop();
        break;
      }
      case 'stop_motors':
        api.stop();
        await sleep(80, isStopped);
        break;
      case 'play_sound': {
        const file = node.fields.sound || 'bark.mp3';
        api.playSound(soundControlPath(file), 1);
        await sleep(200, isStopped);
        break;
      }
      case 'stop_sound':
        api.stopSound();
        break;
      case 'set_var':
        setVar(resolveVarKey(node.inputs?.var), evalNumber(node.inputs?.value));
        break;
      case 'change_var': {
        const key = resolveVarKey(node.inputs?.var);
        setVar(key, getVar(key) + evalNumber(node.inputs?.value));
        break;
      }
      case 'device_turn_on': {
        api.setDevicePower(resolveDevice(node.inputs?.device), true);
        await sleep(120, isStopped);
        break;
      }
      case 'device_turn_off': {
        api.setDevicePower(resolveDevice(node.inputs?.device), false);
        await sleep(120, isStopped);
        break;
      }
      case 'when_obstacle':
      case 'distance_lt':
        break;
      case 'call_proc': {
        const proc = findProc(node.fields.procId);
        if (proc) await runList(proc.children, depth + 1);
        break;
      }
      case 'define_proc':
      case 'number':
      case 'var_reporter':
      case 'device_ref':
      case 'device_is_on':
      case 'device_is_off':
      case 'op_add':
      case 'op_sub':
      case 'op_mul':
      case 'op_div':
      case 'op_eq':
      case 'op_gt':
      case 'op_lt':
      case 'op_gte':
      case 'op_lte':
        break;
      default:
        break;
    }
  };

  const done = (async () => {
    const start = program.script.find((n) => n.kind === 'start');
    if (start) await runNode(start, 0);
    if (!stopped) api.stop();
  })();

  return { stop, done };
}
