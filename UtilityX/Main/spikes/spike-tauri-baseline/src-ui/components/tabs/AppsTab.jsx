import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Search, 
  Star, 
  ExternalLink, 
  ChevronUp, 
  Folder, 
  Terminal, 
  Gamepad2, 
  Music, 
  Globe, 
  MessageSquare, 
  Code2, 
  Layers
} from 'lucide-react';

const APPS_DATA = [
  {
    category: 'STARRED',
    items: [
      { id: 1, name: 'Spotify', type: 'Application', tag: 'Open', starred: true, icon: Music, color: 'text-emerald-400 bg-emerald-500/10' },
      { id: 2, name: 'Visual Studio Code', type: 'Application', tag: 'IDE', starred: true, icon: Code2, color: 'text-blue-400 bg-blue-500/10' },
    ]
  },
  {
    category: 'RECENT',
    items: [
      { id: 3, name: 'Google Chrome', type: 'Application', tag: 'Browser', icon: Globe, color: 'text-amber-400 bg-amber-500/10' },
      { id: 4, name: 'Discord', type: 'Application', tag: 'Chat', icon: MessageSquare, color: 'text-indigo-400 bg-indigo-500/10' },
      { id: 5, name: 'File Explorer', type: 'Application', tag: 'System', icon: Folder, color: 'text-yellow-400 bg-yellow-500/10' },
    ]
  },
  {
    category: 'APPLICATIONS',
    items: [
      { id: 6, name: 'Minecraft', type: 'Game', tag: 'Gaming', icon: Gamepad2, color: 'text-emerald-400 bg-emerald-500/10' },
      { id: 7, name: 'Valorant', type: 'Game', tag: 'FPS', icon: Gamepad2, color: 'text-rose-400 bg-rose-500/10' },
      { id: 8, name: 'Telegram', type: 'Application', tag: 'Messenger', icon: MessageSquare, color: 'text-cyan-400 bg-cyan-500/10' },
      { id: 9, name: 'Canva', type: 'Application', tag: 'Design', icon: Layers, color: 'text-purple-400 bg-purple-500/10' },
    ]
  }
];

export default function AppsTab({ onCollapse, accent }) {
  const [search, setSearch] = useState('');
  const [selectedTag, setSelectedTag] = useState('');

  const accentColor = accent?.primary || '#00F2FE';
  const activeTextColor = accent?.activeText || '#04101E';
  const accentBg = accent?.bgAlpha || 'rgba(0, 242, 254, 0.15)';
  const accentBorder = accent?.borderAlpha || 'rgba(0, 242, 254, 0.35)';

  return (
    <div className="flex flex-col gap-3 h-full justify-between">
      {/* Search Bar & Filter Tags */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-slate-900/70 border border-white/5">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search apps, files and snippets..."
            className="w-full bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none"
          />
        </div>

        {/* Quick Tag Pills */}
        <div className="flex items-center gap-2">
          {['* gmail', '* Qte5', '* dev', '* games'].map((tag) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(selectedTag === tag ? '' : tag)}
              style={selectedTag === tag ? { backgroundColor: accentColor, color: activeTextColor } : {}}
              className={`px-2.5 py-1 rounded-lg text-[10px] font-mono transition-all cursor-pointer ${
                selectedTag === tag
                  ? 'font-bold'
                  : 'bg-slate-900/60 text-slate-400 hover:text-white border border-white/5'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Apps List / Grid */}
      <div className="flex-1 overflow-y-auto space-y-3.5 pr-1 max-h-[300px]">
        {APPS_DATA.map((section) => (
          <div key={section.category}>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 px-1">
              {section.category}
            </div>

            <div className="grid grid-cols-2 gap-2">
              {section.items
                .filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
                .map((app) => {
                  const Icon = app.icon;
                  return (
                    <div
                      key={app.id}
                      className="p-2.5 rounded-xl bg-slate-900/60 border border-white/5 hover:border-white/20 transition-all flex items-center justify-between group cursor-pointer"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${app.color}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white group-hover:text-amber-200 transition-colors truncate">
                            {app.name}
                          </div>
                          <div className="text-[10px] text-slate-400 font-medium">{app.tag}</div>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {app.starred && (
                          <span 
                            style={{ backgroundColor: accentBg, borderColor: accentBorder, color: accentColor }}
                            className="text-[10px] font-bold px-2 py-0.5 rounded-md border"
                          >
                            ★ Open
                          </span>
                        )}
                        {!app.starred && (
                          <span className="text-[10px] text-slate-500 font-medium">
                            {app.type}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        ))}
      </div>

      {/* Bottom Minimize Button */}
      <div className="flex justify-center pt-0.5 border-t border-white/5">
        <button 
          onClick={onCollapse}
          className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white text-[11px] font-medium transition-colors cursor-pointer border border-white/5"
        >
          <ChevronUp className="w-3.5 h-3.5" />
          <span>Minimize</span>
        </button>
      </div>
    </div>
  );
}
