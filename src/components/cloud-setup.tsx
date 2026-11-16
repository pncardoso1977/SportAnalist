"use client";

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { LogIn, LogOut, PlusCircle, ShieldCheck, UserPlus } from "lucide-react";
import type { AppRole } from "@/lib/types";

type Props = {
  supabase: SupabaseClient;
  onWorkspaceReady: (projectId: string, userId: string, role: AppRole, teamName?: string) => void;
  onSignOut: () => void;
  hideAuthenticatedBar?: boolean;
};

export function CloudSetup({ supabase, onWorkspaceReady, onSignOut, hideAuthenticatedBar = false }: Props) {
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signUp, setSignUp] = useState(false);
  const [projectName, setProjectName] = useState("Projeto Futsal");
  const [teamName, setTeamName] = useState("Equipa A");
  const [needsProject, setNeedsProject] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadMembership = async (id: string) => {
      const { data, error } = await supabase.from("project_members")
        .select("project_id, role").eq("user_id", id).limit(1);
      if (cancelled) return;
      if (error) { setNotice(error.message); return; }
      if (!data?.length) { setNeedsProject(true); return; }
      const member = data[0] as { project_id: string; role: AppRole };
      const { data: project } = await supabase.from("projects").select("analyzed_team").eq("id", member.project_id).maybeSingle();
      setNeedsProject(false);
      onWorkspaceReady(member.project_id, id, member.role, project?.analyzed_team);
    };
    // getUser returns "Auth session missing" when a visitor is not signed in.
    // A missing session is the normal initial state, not an application error.
    void supabase.auth.getSession().then(({ data, error }) => {
      if (cancelled) return;
      if (error) { setNotice(error.message); return; }
      const user = data.session?.user;
      if (user) { setUserId(user.id); void loadMembership(user.id); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (cancelled) return;
      if (session?.user) {
        setUserId(session.user.id);
        void loadMembership(session.user.id);
      } else {
        setUserId("");
        setNeedsProject(false);
        onSignOut();
      }
    });
    return () => { cancelled = true; listener.subscription.unsubscribe(); };
  }, [supabase, onWorkspaceReady, onSignOut]);

  async function authenticate() {
    setBusy(true); setNotice("");
    try {
      const result = signUp
        ? await supabase.auth.signUp({ email: email.trim(), password })
        : await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) setNotice(result.error.message);
      else if (signUp && !result.data.session) setNotice("Conta criada. Confirma o endereço de email e inicia sessão.");
      else if (result.data.user) {
        setUserId(result.data.user.id);
        const { data, error } = await supabase.from("project_members").select("project_id, role").eq("user_id", result.data.user.id).limit(1);
        if (error) setNotice(error.message);
        else if (!data?.length) setNeedsProject(true);
        else {
          const { data: project } = await supabase.from("projects").select("analyzed_team").eq("id", data[0].project_id).maybeSingle();
          onWorkspaceReady(data[0].project_id, result.data.user.id, data[0].role as AppRole, project?.analyzed_team);
        }
      }
    } finally { setBusy(false); }
  }

  async function createProject() {
    if (!projectName.trim() || !teamName.trim()) { setNotice("Indica o nome do projeto e da equipa."); return; }
    setBusy(true); setNotice("");
    try {
      const { data, error } = await supabase.rpc("create_analysis_project", {
        project_name: projectName.trim(), team_name: teamName.trim(),
      });
      if (error) setNotice(error.message);
      else if (data) {
        setNeedsProject(false);
        setTeamName(teamName.trim());
        onWorkspaceReady(data as string, userId, "admin", teamName.trim());
      }
    } finally { setBusy(false); }
  }

  async function logout() {
    await supabase.auth.signOut();
    setUserId(""); setNeedsProject(false); onSignOut();
  }

  if (!userId) return (
    <section className={`panel grid gap-3 p-3 ${hideAuthenticatedBar ? "grid-cols-1" : "md:grid-cols-[1fr_1fr_auto] md:items-end"}`}>
      <div className="md:col-span-3">
        <div className="flex items-center gap-2 font-semibold"><ShieldCheck size={17} className="text-[#60e69a]" /> Acesso da equipa / Team access</div>
        <p className="muted mt-1 text-xs">Supabase está configurado. Inicia sessão para ativar a base de dados partilhada e as permissões.</p>
      </div>
      <label className="text-xs text-[#9eb0c0]">Email<input className="field mt-2" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label className="text-xs text-[#9eb0c0]">Password<input className="field mt-2" type="password" autoComplete={signUp ? "new-password" : "current-password"} value={password} onChange={(e) => setPassword(e.target.value)} /></label>
      <button disabled={busy || !email.trim() || password.length < 8} className="btn btn-primary h-[42px]" onClick={() => void authenticate()}>{signUp ? <UserPlus size={15} /> : <LogIn size={15} />}{signUp ? "Criar conta" : "Entrar"}</button>
      <div className="md:col-span-3 flex flex-wrap items-center justify-between gap-2">
        <button className="btn btn-quiet !px-0 text-xs" onClick={() => setSignUp(!signUp)}>{signUp ? "Já tenho conta · Iniciar sessão" : "Criar uma conta de analista"}</button>
        {notice && <span role="status" className="text-xs text-amber-300">{notice}</span>}
      </div>
    </section>
  );

  if (needsProject) return (
    <section className="panel grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
      <div className="md:col-span-3"><div className="font-semibold">Criar projeto de análise</div><p className="muted mt-1 text-xs">O primeiro utilizador fica como administrador deste projeto.</p></div>
      <label className="text-xs text-[#9eb0c0]">Nome do projeto<input className="field mt-2" value={projectName} onChange={(e) => setProjectName(e.target.value)} /></label>
      <label className="text-xs text-[#9eb0c0]">Equipa analisada<input className="field mt-2" value={teamName} onChange={(e) => setTeamName(e.target.value)} /></label>
      <button disabled={busy} className="btn btn-primary h-[42px]" onClick={() => void createProject()}><PlusCircle size={15} />Criar projeto</button>
      {notice && <p role="status" className="md:col-span-3 text-xs text-amber-300">{notice}</p>}
    </section>
  );

  if (hideAuthenticatedBar) return null;

  return (
    <section className="panel flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div className="flex items-center gap-2 text-sm"><span className="h-2 w-2 rounded-full bg-[#35d07f]" /><span className="font-medium">Conta autenticada</span><span className="muted text-xs">{email || "Supabase Auth"}</span></div>
      <button className="btn btn-quiet text-xs" onClick={() => void logout()}><LogOut size={14} />Terminar sessão</button>
      {notice && <p className="w-full text-xs text-amber-300">{notice}</p>}
    </section>
  );
}
