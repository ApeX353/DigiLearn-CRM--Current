import { create } from "zustand";
import type { Stage, Pipeline } from "~/api/pipelines";

interface PipelineStageDialogState {
  isOpen: boolean;
  stage: Stage | undefined;
  pipelineId: string | undefined;
  nextOrder: number;
}

interface PipelineDialogState {
  isOpen: boolean;
  pipeline: Pipeline | undefined;
}

interface PipelineStageStore {
  // Stage Dialog State
  stageDialog: PipelineStageDialogState;
  openStageDialog: (pipelineId: string, nextOrder: number, stage?: Stage) => void;
  closeStageDialog: () => void;

  // Pipeline Dialog State
  pipelineDialog: PipelineDialogState;
  openPipelineDialog: (pipeline?: Pipeline) => void;
  closePipelineDialog: () => void;
}

export const usePipelineStageStore = create<PipelineStageStore>((set) => ({
  // Stage Dialog Initial State
  stageDialog: {
    isOpen: false,
    stage: undefined,
    pipelineId: undefined,
    nextOrder: 1,
  },

  // Stage Dialog Actions
  openStageDialog: (pipelineId: string, nextOrder: number, stage?: Stage) =>
    set({
      stageDialog: {
        isOpen: true,
        stage,
        pipelineId,
        nextOrder,
      },
    }),

  closeStageDialog: () =>
    set({
      stageDialog: {
        isOpen: false,
        stage: undefined,
        pipelineId: undefined,
        nextOrder: 1,
      },
    }),

  // Pipeline Dialog Initial State
  pipelineDialog: {
    isOpen: false,
    pipeline: undefined,
  },

  // Pipeline Dialog Actions
  openPipelineDialog: (pipeline?: Pipeline) =>
    set({
      pipelineDialog: {
        isOpen: true,
        pipeline,
      },
    }),

  closePipelineDialog: () =>
    set({
      pipelineDialog: {
        isOpen: false,
        pipeline: undefined,
      },
    }),
}));
