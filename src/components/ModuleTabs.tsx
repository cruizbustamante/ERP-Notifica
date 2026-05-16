"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = { label: string; href: string };
type TabGroup = { group: string; tabs: Tab[] };

export default function ModuleTabs({ groups }: { groups: TabGroup[] }) {
  const pathname = usePathname();

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 overflow-hidden">
      <div className="flex flex-wrap gap-0 border-b border-gray-100 px-2 pt-2 overflow-x-auto">
        {groups.map((group) => (
          <div key={group.group} className="flex items-center">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 py-2 hidden lg:block">
              {group.group}
            </span>
            {group.tabs.map((tab) => {
              const active = pathname === tab.href || pathname.startsWith(tab.href + "/");
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`px-3 py-2.5 text-sm font-medium rounded-t-lg transition-all whitespace-nowrap ${
                    active
                      ? "text-indigo-700 bg-indigo-50 border-b-2 border-indigo-600"
                      : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                  }`}
                >
                  {tab.label}
                </Link>
              );
            })}
            <div className="w-px h-5 bg-gray-200 mx-2 hidden lg:block last:hidden" />
          </div>
        ))}
      </div>
    </div>
  );
}
