import type { IsraelCity } from "@/lib/geo/israel-cities";

type SitterProfileWorkingCitiesRowProps = {
  cities: readonly IsraelCity[];
  className?: string;
};

export function SitterProfileWorkingCitiesRow({
  cities,
  className = ""
}: SitterProfileWorkingCitiesRowProps) {
  return (
    <div
      className={`mt-1 flex flex-row-reverse items-center justify-end gap-2 text-sm ${className}`}
      dir="rtl"
    >
      <span className="text-gray-500">אזור עבודה:</span>
      <span className="font-medium text-gray-900">
        {cities.length > 0 ? cities.join(", ") : "לא הוגדרו אזורי שירות"}
      </span>
    </div>
  );
}
