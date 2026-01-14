import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ChipInputProps {
  value: string[];
  onChange: (chips: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ChipInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Add...",
  disabled = false,
  className,
}: ChipInputProps) {
  const [inputValue, setInputValue] = React.useState("");
  const [showSuggestions, setShowSuggestions] = React.useState(false);
  const [flashChip, setFlashChip] = React.useState<string | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Filter suggestions based on input and exclude already selected chips
  const filteredSuggestions = React.useMemo(() => {
    if (!inputValue.trim()) return suggestions.filter((s) => !value.includes(s));
    const lower = inputValue.toLowerCase();
    return suggestions.filter(
      (s) => s.toLowerCase().includes(lower) && !value.includes(s)
    );
  }, [inputValue, suggestions, value]);

  const addChip = React.useCallback(
    (chip: string) => {
      const trimmed = chip.trim();
      if (!trimmed) return;

      // Check for duplicate
      if (value.includes(trimmed)) {
        setFlashChip(trimmed);
        setTimeout(() => setFlashChip(null), 300);
        setInputValue("");
        return;
      }

      onChange([...value, trimmed]);
      setInputValue("");
      setShowSuggestions(false);
    },
    [value, onChange]
  );

  const removeChip = React.useCallback(
    (chipToRemove: string) => {
      onChange(value.filter((chip) => chip !== chipToRemove));
    },
    [value, onChange]
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter" || e.key === "Tab" || e.key === ",") {
        if (inputValue.trim()) {
          e.preventDefault();
          addChip(inputValue);
        }
      } else if (e.key === "Backspace" && !inputValue && value.length > 0) {
        // Remove last chip when backspace is pressed on empty input
        removeChip(value[value.length - 1]);
      } else if (e.key === "Escape") {
        setShowSuggestions(false);
        inputRef.current?.blur();
      }
    },
    [inputValue, value, addChip, removeChip]
  );

  const handleInputChange = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const newValue = e.target.value;
      // Handle comma in paste or typing
      if (newValue.includes(",")) {
        const parts = newValue.split(",");
        parts.forEach((part, index) => {
          if (index < parts.length - 1) {
            addChip(part);
          } else {
            setInputValue(part);
          }
        });
      } else {
        setInputValue(newValue);
      }
      setShowSuggestions(true);
    },
    [addChip]
  );

  const handleSuggestionClick = React.useCallback(
    (suggestion: string) => {
      addChip(suggestion);
      inputRef.current?.focus();
    },
    [addChip]
  );

  // Close suggestions when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 min-h-[40px] px-3 py-2",
          "rounded-md border border-input bg-background",
          "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 focus-within:ring-offset-background",
          "transition-colors",
          disabled && "opacity-50 cursor-not-allowed"
        )}
        onClick={() => !disabled && inputRef.current?.focus()}
      >
        {/* Chips */}
        {value.map((chip) => (
          <span
            key={chip}
            className={cn(
              "inline-flex items-center gap-1 px-2 py-0.5",
              "text-xs font-medium rounded-full",
              "bg-secondary text-secondary-foreground",
              "transition-all duration-150",
              flashChip === chip && "animate-pulse ring-2 ring-destructive"
            )}
          >
            {chip}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeChip(chip);
                }}
                className={cn(
                  "inline-flex items-center justify-center",
                  "w-3.5 h-3.5 rounded-full",
                  "hover:bg-muted-foreground/20",
                  "focus:outline-none focus:ring-1 focus:ring-ring",
                  "transition-colors"
                )}
                aria-label={`Remove ${chip}`}
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </span>
        ))}

        {/* Input */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => setShowSuggestions(true)}
          placeholder={value.length === 0 ? placeholder : ""}
          disabled={disabled}
          className={cn(
            "flex-1 min-w-[80px] bg-transparent",
            "text-sm outline-none",
            "placeholder:text-muted-foreground",
            disabled && "cursor-not-allowed"
          )}
          aria-label="Add chip"
        />
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && filteredSuggestions.length > 0 && !disabled && (
        <div
          className={cn(
            "absolute z-50 w-full mt-1",
            "max-h-48 overflow-y-auto",
            "rounded-md border border-border bg-popover",
            "shadow-md"
          )}
        >
          {filteredSuggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => handleSuggestionClick(suggestion)}
              className={cn(
                "w-full px-3 py-2 text-left text-sm",
                "hover:bg-accent hover:text-accent-foreground",
                "focus:bg-accent focus:text-accent-foreground focus:outline-none",
                "transition-colors"
              )}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
