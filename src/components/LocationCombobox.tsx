"use client";

import * as React from "react";
import { Check, X, Loader2, MapPin, Search } from "lucide-react";
import { useDebounce } from "use-debounce";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface LocationComboboxProps {
  value?: string[];
  onChange: (value: string[]) => void;
  targetScope: "local" | "regional" | "global";
}

interface GeoapifyFeature {
  properties: {
    formatted: string;
    place_id: string;
  };
}

export function LocationCombobox({
  value = [],
  onChange,
  targetScope,
}: LocationComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [debouncedSearch] = useDebounce(search, 300);
  const [options, setOptions] = React.useState<{ label: string; value: string }[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  
  const containerRef = React.useRef<HTMLDivElement>(null);
  const prevScopeRef = React.useRef(targetScope);

  React.useEffect(() => {
    if (prevScopeRef.current !== targetScope) {
      onChange([]); // Clear selections when scope changes
      setSearch("");
      setOptions([]);
      setOpen(false);
      prevScopeRef.current = targetScope;
    }
  }, [targetScope, onChange]);

  React.useEffect(() => {
    // Close dropdown when clicking outside
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  React.useEffect(() => {
    if (!debouncedSearch) {
      setOptions([]);
      return;
    }

    async function fetchLocations() {
      setIsLoading(true);
      setErrorMsg(null);
      try {
        const typeParam = targetScope === "regional" ? "country" : "city";
        const res = await fetch(
          `/api/location?text=${encodeURIComponent(debouncedSearch)}&type=${typeParam}`
        );

        if (res.status === 403 || res.status === 429) {
          setErrorMsg("Daily limit reached. Please try again tomorrow.");
          setOptions([]);
          return;
        }

        if (!res.ok) {
          throw new Error("Failed to fetch");
        }

        const data = await res.json();
        
        if (data.features) {
          const formattedOptions = data.features.map((feature: GeoapifyFeature) => ({
            label: feature.properties.formatted,
            value: feature.properties.formatted,
          }));
          
          const uniqueOptions = Array.from(new Map(formattedOptions.map((item: any) => [item.value, item])).values()) as any;
          setOptions(uniqueOptions);
          setOpen(true);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchLocations();
  }, [debouncedSearch, targetScope]);

  const handleSelect = (currentValue: string) => {
    if (!value.includes(currentValue)) {
      onChange([...value, currentValue]);
    }
    setSearch("");
    setOpen(false);
  };

  const handleRemove = (itemToRemove: string) => {
    onChange(value.filter((val) => val !== itemToRemove));
  };

  return (
    <div className="flex flex-col space-y-3" ref={containerRef}>
      {/* Badges Container */}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-1">
          {value.map((item) => (
            <Badge
              key={item}
              variant="secondary"
              className="bg-indigo-500/20 text-indigo-300 hover:bg-indigo-500/30 border border-indigo-500/30 text-sm py-1 px-3"
            >
              {item}
              <div
                className="ml-2 ring-offset-background rounded-full outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                }}
                onClick={() => handleRemove(item)}
              >
                <X className="h-3 w-3 text-indigo-400 hover:text-indigo-200 transition-colors" />
              </div>
            </Badge>
          ))}
        </div>
      )}

      {/* Main Input */}
      <div className="relative w-full">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <Input
          placeholder={value.length > 0 ? "Location selected" : `Search for ${targetScope === "regional" ? "countries" : "cities or states"}...`}
          value={search}
          disabled={value.length > 0}
          onChange={(e) => {
            setSearch(e.target.value);
            if (e.target.value.length > 0) setOpen(true);
            else setOpen(false);
          }}
          onFocus={() => {
            if (options.length > 0 || search.length > 0) setOpen(true);
          }}
          className="pl-10 w-full bg-slate-950/50 border-slate-700 hover:border-slate-600 focus-visible:ring-indigo-500 text-slate-200 placeholder:text-slate-500 min-h-12 disabled:opacity-50 disabled:cursor-not-allowed"
        />
        {isLoading && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
        )}

        {/* Dropdown Content */}
        {open && (search.length > 0 || options.length > 0) && (
          <div className="absolute bottom-full mb-2 left-0 w-full z-[100] bg-slate-900 border border-slate-800 rounded-md shadow-2xl overflow-hidden max-h-60 overflow-y-auto">
            {!isLoading && options.length === 0 && search.length > 0 && !errorMsg && (
              <div className="py-6 text-center text-sm text-slate-500">
                No locations found.
              </div>
            )}
            
            {options.map((option) => (
              <div
                key={option.value}
                onClick={() => handleSelect(option.value)}
                className="flex items-center px-4 py-3 cursor-pointer text-sm text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-colors"
              >
                <MapPin className="mr-3 h-4 w-4 text-indigo-500/50 flex-shrink-0" />
                <span className="truncate">{option.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {errorMsg && (
        <p className="text-xs font-medium text-red-400/80 mt-1">
          {errorMsg}
        </p>
      )}
    </div>
  );
}
