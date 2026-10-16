// Missions: agents on several devices coordinating through a GitHub draft PR (docs/missions.md).
export { claimSeat, leaveSeat, raiseSeatCap, startMission, type ClaimInput, type StartInput } from "./actions";
export { answerAsk, decideClaim, leadAct } from "./human-acts";
export type { MissionResult } from "./result";
export { startMissionPoller } from "./poller";
export { deviceId, deviceLabel } from "./device";
export { joinableHubs, missionView, seatForInstance } from "./views";
