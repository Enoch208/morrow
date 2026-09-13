import { stateLanguage, type DestinationState, type SourceRoundState } from "@morrow/protocol";

export const sourceStateLabels: Readonly<Record<SourceRoundState, string>> = {
  ABSENT: "Not reserved",
  RESERVED: stateLanguage.SOURCE_RESERVED,
  ASSIGNED: stateLanguage.ASSIGNED_ON_SOURCE,
  CANCELLED: "Cancelled on source",
};

export const destinationStateLabels: Readonly<Record<DestinationState, string>> = {
  ABSENT: "No destination sale",
  BOUND: stateLanguage.DESTINATION_FUNDED,
  ASSIGNED_CLAIMABLE: "Assignment recognized",
  CANCELLED_CLAIMABLE: "Cancellation recognized",
};
