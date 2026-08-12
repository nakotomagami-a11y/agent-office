import { useState, type ChangeEvent } from "react";
import { validateForm, type AgentFormValues } from "../form/agent-form";

export function useAgentForm(
  initial: AgentFormValues,
  onSave: (values: AgentFormValues) => Promise<void>,
) {
  const [v, setV] = useState<AgentFormValues>(initial);
  const [errors, setErrors] = useState<string[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [view, setView] = useState<"write" | "preview">("write");
  const [skillInput, setSkillInput] = useState("");
  const [toolInput, setToolInput] = useState("");

  const dirty = JSON.stringify(v) !== JSON.stringify(initial);
  const skills = v.skills ? v.skills.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const tools = v.tools ? v.tools.split(",").map((t) => t.trim()).filter(Boolean) : [];

  const set =
    <K extends keyof AgentFormValues>(key: K) =>
    (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setV((prev) => ({ ...prev, [key]: e.target.value }));

  const setSkills = (arr: string[]) => setV((prev) => ({ ...prev, skills: arr.join(", ") }));
  const setTools = (arr: string[]) => setV((prev) => ({ ...prev, tools: arr.join(", ") }));

  const addSkill = () => {
    const val = skillInput.trim();
    if (val && !skills.includes(val)) setSkills([...skills, val]);
    setSkillInput("");
  };

  const addTool = () => {
    const val = toolInput.trim();
    if (val && !tools.includes(val)) setTools([...tools, val]);
    setToolInput("");
  };

  const handleSave = async () => {
    const errs = validateForm(v);
    if (errs.length > 0) {
      setErrors(errs.map((e) => e.message));
      return;
    }
    setErrors([]);
    setServerError(null);
    try {
      await onSave(v);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleDiscard = () => setV(initial);

  return {
    v, setV,
    errors,
    serverError,
    view, setView,
    skillInput, setSkillInput,
    toolInput, setToolInput,
    dirty,
    skills,
    tools,
    set,
    setSkills,
    setTools,
    addSkill,
    addTool,
    handleSave,
    handleDiscard,
  };
}
