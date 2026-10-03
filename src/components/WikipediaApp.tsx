"use client";
import { useState } from "react";
import { PlanetView } from "./globe/PlanetView";
import { useSettings } from "@/hooks/useSettings";
import { useWikipedia } from "@/hooks/useWikipedia";
import { Header } from "./Header";
import { ActivityCanvas } from "./ActivityCanvas";
import { RecentChanges } from "./RecentChanges";
import { SettingsPanel } from "./SettingsPanel";
import { About } from "./About";
import { Mp3Settings } from "./Mp3Settings";
import { Modal } from "./Modal";

export function WikipediaApp() {
  const [modal, setModal] = useState<"settings" | "about" | null>(null);
  const [view, setView] = useState<"list" | "planet">("list");
  const { settings, update, ready } = useSettings();
  const wiki = useWikipedia(settings, ready);
  return (
    <main id="top">
      <Header
        status={wiki.status}
        audioState={wiki.audioState}
        volume={settings.volume}
        muted={settings.muted}
        onEnable={() => void wiki.enableAudio()}
        onVolume={(volume) => update({ volume })}
        onMute={() => update({ muted: !settings.muted })}
        onSettings={() => setModal("settings")}
        onAbout={() => setModal("about")}
      />
      <nav className="view-switch" aria-label="Visualizzazione delle modifiche">
        <button aria-pressed={view === "list"} onClick={() => setView("list")}>
          ◎ Cerchi live
        </button>
        <button
          aria-pressed={view === "planet"}
          onClick={() => setView("planet")}
        >
          ◉ Pianeta 3D
        </button>
        <span className="view-caption">Ogni modifica, una nuova nota.</span>
      </nav>
      {view === "planet" ? (
        <PlanetView events={wiki.recent} />
      ) : (
        <ActivityCanvas
          events={wiki.events}
          settings={settings}
          rate={wiki.rate}
          total={wiki.total}
        />
      )}
      <div className="content">
        {view === "list" && !settings.hideLog && (
          <RecentChanges events={wiki.recent} />
        )}
        <footer className="app-footer">
          <span>Un mondo in movimento. Una nota alla volta.</span>
          <button onClick={() => setModal("about")}>
            Scopri il progetto ↗
          </button>
        </footer>
      </div>
      {modal && (
        <Modal
          title={
            modal === "settings"
              ? "Il tuo ascolto"
              : "Il suono di OpenStreetMap"
          }
          subtitle={
            modal === "settings"
              ? "Personalizza la tua esperienza. Le modifiche si applicano subito."
              : "La conoscenza prende forma, in tempo reale."
          }
          onClose={() => setModal(null)}
        >
          {modal === "settings" ? (
            <SettingsPanel
              settings={settings}
              onChange={update}
              music={<Mp3Settings {...wiki} />}
            />
          ) : (
            <About />
          )}
        </Modal>
      )}
    </main>
  );
}
