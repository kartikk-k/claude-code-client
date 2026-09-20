"use client";

import { useState } from "react";
import {
  SettingsTitle,
  SettingsSection,
  SettingsCard,
  SettingsRow,
} from "../components/primitives";
import { Switch, Select } from "../components/controls";
import { EFFORT_LEVELS, type EffortLevel } from "../../components/composer/EffortMenu";

/** Model catalog, kept in sync with the composer's model selector. */
const MODELS = [
  { value: "opus", label: "Claude Opus 4.8" },
  { value: "sonnet", label: "Claude Sonnet 5" },
  { value: "haiku", label: "Claude Haiku 4.5" },
] as const;

type ModelId = (typeof MODELS)[number]["value"];

/**
 * Model settings — the default model + reasoning effort a new session starts
 * with, plus token/thinking preferences. These mirror the per-message controls
 * in the composer, exposed here as defaults.
 */
export default function ModelSettings() {
  const [defaultModel, setDefaultModel] = useState<ModelId>("sonnet");
  const [effort, setEffort] = useState<EffortLevel>("Medium");
  const [extendedThinking, setExtendedThinking] = useState(true);
  const [showThinking, setShowThinking] = useState(true);
  const [autoCompact, setAutoCompact] = useState(true);

  return (
    <>
      <SettingsTitle>Model</SettingsTitle>

      <SettingsSection title="Defaults">
        <SettingsCard>
          <SettingsRow
            title="Default model"
            description="The model new sessions start with. You can still switch per message."
            control={
              <Select<ModelId>
                value={defaultModel}
                onChange={setDefaultModel}
                minWidth={180}
                options={MODELS.map((m) => ({ value: m.value, label: m.label }))}
              />
            }
          />
          <SettingsRow
            title="Default reasoning effort"
            description="How much the model thinks before responding by default."
            control={
              <Select<EffortLevel>
                value={effort}
                onChange={setEffort}
                minWidth={140}
                options={EFFORT_LEVELS.map((e) => ({ value: e, label: e }))}
              />
            }
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Thinking">
        <SettingsCard>
          <SettingsRow
            title="Extended thinking"
            description="Let the model use a private scratchpad for harder problems."
            control={
              <Switch
                checked={extendedThinking}
                onChange={setExtendedThinking}
                label="Extended thinking"
              />
            }
          />
          <SettingsRow
            title="Show thinking in transcript"
            description="Display the model's reasoning blocks inline in the conversation."
            control={
              <Switch
                checked={showThinking}
                onChange={setShowThinking}
                label="Show thinking in transcript"
              />
            }
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="Context">
        <SettingsCard>
          <SettingsRow
            title="Auto-compact long sessions"
            description="Summarize earlier turns automatically when a session approaches the context limit."
            control={
              <Switch
                checked={autoCompact}
                onChange={setAutoCompact}
                label="Auto-compact long sessions"
              />
            }
          />
        </SettingsCard>
      </SettingsSection>
    </>
  );
}
