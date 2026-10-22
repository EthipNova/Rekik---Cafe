import React, { useEffect, useRef, useState } from "react";
import {
  MapPin,
  Navigation,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Info,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  calculateDeliveryFee,
  calculateHaversineDistance,
  isValidCoordinate,
  type DeliveryFeeCalculationResult,
  type DeliveryRoundingRule,
} from "@/lib/distance";
import { formatETB } from "@/lib/menu-data";

export interface LocationPickerProps {
  cafeLatitude: number | null;
  cafeLongitude: number | null;
  selectedLatitude: number | null;
  selectedLongitude: number | null;
  onLocationChange: (coords: { latitude: number; longitude: number } | null) => void;
  pricePerKm: number;
  minDeliveryFee: number;
  maxDeliveryDistanceKm: number;
  roundingRule: DeliveryRoundingRule;
  deliveryEnabled: boolean;
  disabled?: boolean;
}

export function LocationPicker({
  cafeLatitude,
  cafeLongitude,
  selectedLatitude,
  selectedLongitude,
  onLocationChange,
  pricePerKm,
  minDeliveryFee,
  maxDeliveryDistanceKm,
  roundingRule,
  deliveryEnabled,
  disabled = false,
}: LocationPickerProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<any>(null);
  const customerMarkerRef = useRef<any>(null);
  const cafeMarkerRef = useRef<any>(null);
  const circleRef = useRef<any>(null);

  const [isLocating, setIsLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [showManualInputs, setShowManualInputs] = useState(false);

  const hasCafeCoords = isValidCoordinate(cafeLatitude, cafeLongitude);
  const hasCustomerCoords = isValidCoordinate(selectedLatitude, selectedLongitude);

  // Compute live distance and fee calculation
  let distanceKm: number | null = null;
  let feeResult: DeliveryFeeCalculationResult | null = null;

  if (hasCafeCoords && hasCustomerCoords) {
    distanceKm = calculateHaversineDistance(
      cafeLatitude!,
      cafeLongitude!,
      selectedLatitude!,
      selectedLongitude!,
    );
    feeResult = calculateDeliveryFee(
      distanceKm,
      {
        pricePerKm,
        minDeliveryFee,
        maxDeliveryDistanceKm,
        roundingRule,
        deliveryEnabled,
      },
      { hasCafeCoordinates: true },
    );
  }

  // Initialize Leaflet dynamically on the client
  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    let isMounted = true;

    Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css" as any).catch(() => {})])
      .then(([leafletModule]) => {
        if (!isMounted || !mapContainerRef.current) return;
        const L = (leafletModule as any).default || leafletModule;

        // Clean up previous instance if any
        if (mapInstanceRef.current) {
          mapInstanceRef.current.remove();
          mapInstanceRef.current = null;
        }

        // Determine initial map center
        // Priority: selected customer location -> cafe location -> Hawassa regional fallback
        const initialLat = hasCustomerCoords
          ? selectedLatitude!
          : hasCafeCoords
            ? cafeLatitude!
            : 7.058;
        const initialLng = hasCustomerCoords
          ? selectedLongitude!
          : hasCafeCoords
            ? cafeLongitude!
            : 38.473;
        const initialZoom = hasCustomerCoords || hasCafeCoords ? 14 : 12;

        const map = L.map(mapContainerRef.current, {
          center: [initialLat, initialLng],
          zoom: initialZoom,
          zoomControl: true,
          attributionControl: true,
        });

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
          maxZoom: 19,
        }).addTo(map);

        // Café marker SVG icon (Red/Brand pin)
        const cafeIcon = L.divIcon({
          className: "neba-cafe-pin",
          html: `
            <div style="display: flex; flex-direction: column; align-items: center; cursor: default;">
              <div style="background: #C8102E; color: white; padding: 4px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 2px solid white; white-space: nowrap; margin-bottom: 2px;">
                ☕ NEBA CAFÉ
              </div>
              <div style="width: 14px; height: 14px; background: #C8102E; border: 2px solid white; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.4);"></div>
            </div>
          `,
          iconSize: [100, 42],
          iconAnchor: [50, 42],
        });

        // Customer marker SVG icon (Charcoal/Target pin)
        const customerIcon = L.divIcon({
          className: "neba-customer-pin",
          html: `
            <div style="display: flex; flex-direction: column; align-items: center; cursor: grab;">
              <div style="background: #1F2937; color: white; padding: 4px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 2px solid #C8102E; white-space: nowrap; margin-bottom: 2px;">
                📍 Your Location (Drag)
              </div>
              <div style="width: 16px; height: 16px; background: #1F2937; border: 3px solid #C8102E; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.4);"></div>
            </div>
          `,
          iconSize: [140, 44],
          iconAnchor: [70, 44],
        });

        // Add Café Marker if coordinates configured
        if (hasCafeCoords) {
          const cMarker = L.marker([cafeLatitude!, cafeLongitude!], {
            icon: cafeIcon,
            interactive: false,
          }).addTo(map);
          cafeMarkerRef.current = cMarker;

          // Delivery radius circle
          const radiusMeters = maxDeliveryDistanceKm * 1000;
          const circle = L.circle([cafeLatitude!, cafeLongitude!], {
            radius: radiusMeters,
            color: "#C8102E",
            fillColor: "#C8102E",
            fillOpacity: 0.06,
            weight: 1.5,
            dashArray: "4, 6",
          }).addTo(map);
          circleRef.current = circle;
        }

        // Add Customer Marker if selected
        if (hasCustomerCoords) {
          const custMarker = L.marker([selectedLatitude!, selectedLongitude!], {
            icon: customerIcon,
            draggable: !disabled,
          }).addTo(map);

          custMarker.on("dragend", (e: any) => {
            const pos = e.target.getLatLng();
            onLocationChange({ latitude: pos.lat, longitude: pos.lng });
          });

          customerMarkerRef.current = custMarker;
        }

        // Map Click to place or move customer marker
        map.on("click", (e: any) => {
          if (disabled) return;
          const { lat, lng } = e.latlng;
          onLocationChange({ latitude: lat, longitude: lng });
        });

        mapInstanceRef.current = map;
        setMapReady(true);
      })
      .catch((err) => {
        console.error("Failed to initialize Leaflet map:", err);
      });

    return () => {
      isMounted = false;
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // Update customer marker position when selectedLatitude/selectedLongitude changes
  useEffect(() => {
    if (!mapReady || !mapInstanceRef.current) return;

    import("leaflet").then((leafletModule) => {
      const L = (leafletModule as any).default || leafletModule;
      const map = mapInstanceRef.current;
      if (!map) return;

      if (hasCustomerCoords) {
        const targetLatLng = [selectedLatitude!, selectedLongitude!];

        if (customerMarkerRef.current) {
          customerMarkerRef.current.setLatLng(targetLatLng);
        } else {
          const customerIcon = L.divIcon({
            className: "neba-customer-pin",
            html: `
              <div style="display: flex; flex-direction: column; align-items: center; cursor: grab;">
                <div style="background: #1F2937; color: white; padding: 4px 8px; border-radius: 9999px; font-size: 11px; font-weight: 700; box-shadow: 0 2px 8px rgba(0,0,0,0.3); border: 2px solid #C8102E; white-space: nowrap; margin-bottom: 2px;">
                  📍 Your Location (Drag)
                </div>
                <div style="width: 16px; height: 16px; background: #1F2937; border: 3px solid #C8102E; border-radius: 50%; box-shadow: 0 2px 6px rgba(0,0,0,0.4);"></div>
              </div>
            `,
            iconSize: [140, 44],
            iconAnchor: [70, 44],
          });

          const newMarker = L.marker(targetLatLng, {
            icon: customerIcon,
            draggable: !disabled,
          }).addTo(map);

          newMarker.on("dragend", (e: any) => {
            const pos = e.target.getLatLng();
            onLocationChange({ latitude: pos.lat, longitude: pos.lng });
          });

          customerMarkerRef.current = newMarker;
        }

        // Pan smoothly to selected position
        map.panTo(targetLatLng, { animate: true, duration: 0.5 });
      } else if (customerMarkerRef.current) {
        map.removeLayer(customerMarkerRef.current);
        customerMarkerRef.current = null;
      }
    });
  }, [selectedLatitude, selectedLongitude, mapReady, hasCustomerCoords, disabled]);

  // Request browser geolocation
  const handleUseMyLocation = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setGeoError("Geolocation is not supported by your browser or device.");
      return;
    }

    setIsLocating(true);
    setGeoError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsLocating(false);
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        onLocationChange({ latitude: lat, longitude: lng });

        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([lat, lng], 15, { duration: 1.2 });
        }
      },
      (err) => {
        setIsLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setGeoError(
            "Location permission was denied. Please allow location access or tap on the map to set your pin manually.",
          );
        } else if (err.code === err.POSITION_UNAVAILABLE) {
          setGeoError(
            "Location information is currently unavailable. Please tap on the map to select your location.",
          );
        } else if (err.code === err.TIMEOUT) {
          setGeoError("Location request timed out. Please try again or tap on the map.");
        } else {
          setGeoError("Unable to retrieve location. Please tap on the map to pin your location.");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      },
    );
  };

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5 shadow-xs">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <MapPin className="size-4 text-primary" aria-hidden />
            <span className="font-display text-sm font-semibold text-foreground">
              Delivery Pin & Distance Calculation
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Tap the map or use your device GPS to pinpoint your exact delivery address.
          </p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleUseMyLocation}
          disabled={disabled || isLocating}
          className="h-8 gap-1.5 text-xs font-medium border-primary/40 text-primary hover:bg-primary/10"
        >
          {isLocating ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              <span>Locating...</span>
            </>
          ) : (
            <>
              <Navigation className="size-3.5" aria-hidden />
              <span>Use My Location</span>
            </>
          )}
        </Button>
      </div>

      {/* Geolocation permission or error alert */}
      {geoError && (
        <div
          role="alert"
          className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive flex items-start gap-2.5"
        >
          <AlertTriangle className="size-4 shrink-0 mt-0.5" aria-hidden />
          <div className="flex-1 space-y-1">
            <p className="font-semibold">Location Access</p>
            <p>{geoError}</p>
          </div>
        </div>
      )}

      {/* Unconfigured Café Warning */}
      {!hasCafeCoords && (
        <div
          role="alert"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5"
        >
          <AlertTriangle className="size-4 shrink-0 mt-0.5 text-amber-500" aria-hidden />
          <div className="space-y-0.5">
            <p className="font-semibold">Delivery Temporarily Unavailable</p>
            <p>
              The café location has not been configured by administration. Customers cannot place
              delivery orders at this time. Please choose Takeaway or Dine-in.
            </p>
          </div>
        </div>
      )}

      {/* Interactive Leaflet Map Container */}
      <div className="relative overflow-hidden rounded-xl border border-border/80 bg-muted/40 shadow-inner">
        <div
          ref={mapContainerRef}
          className="h-[280px] w-full z-0 cursor-crosshair"
          style={{ minHeight: "260px" }}
          aria-label="Delivery location picker map"
        />

        {/* Floating guidance overlay */}
        <div className="absolute bottom-2.5 left-2.5 right-2.5 pointer-events-none z-[400] flex justify-center">
          <div className="rounded-full bg-background/90 backdrop-blur-xs px-3.5 py-1 text-[11px] font-medium text-muted-foreground shadow-sm border border-border">
            {hasCustomerCoords
              ? "Drag pin or tap anywhere on the map to adjust location"
              : "Tap anywhere on the map to place your delivery pin"}
          </div>
        </div>
      </div>

      {/* Distance and Live Delivery Fee Estimate */}
      {hasCafeCoords && hasCustomerCoords && distanceKm !== null && (
        <div
          className={`rounded-xl border p-3.5 text-xs transition-colors ${
            feeResult?.eligible
              ? "border-primary/30 bg-primary/5"
              : "border-destructive/40 bg-destructive/10 text-destructive"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {feeResult?.eligible ? (
                <CheckCircle2 className="size-4 text-primary shrink-0" aria-hidden />
              ) : (
                <AlertTriangle className="size-4 text-destructive shrink-0" aria-hidden />
              )}
              <div>
                <span className="font-semibold text-foreground">
                  Distance: {distanceKm.toFixed(1)} KM
                </span>
                <span className="text-muted-foreground ml-2">
                  (Max radius: {maxDeliveryDistanceKm} KM)
                </span>
              </div>
            </div>

            {feeResult?.eligible ? (
              <div className="text-right">
                <span className="text-muted-foreground text-[11px]">Estimated Delivery: </span>
                <strong className="font-display text-sm font-bold text-primary">
                  {formatETB(feeResult.fee)}
                </strong>
              </div>
            ) : (
              <span className="font-semibold text-xs text-destructive">
                Outside Delivery Radius
              </span>
            )}
          </div>

          {!feeResult?.eligible && (
            <p className="mt-2 text-xs text-destructive">
              Your selected location is outside our delivery area. Please select a closer location,
              or switch to Takeaway or Dine-in to complete your order.
            </p>
          )}
        </div>
      )}

      {/* Coordinate Display & Manual Input Toggle */}
      <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
        <div>
          {hasCustomerCoords ? (
            <span>
              Coordinates:{" "}
              <code>
                {selectedLatitude?.toFixed(6)}, {selectedLongitude?.toFixed(6)}
              </code>
            </span>
          ) : (
            <span className="text-destructive font-medium">
              * Delivery location pin is required
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowManualInputs((prev) => !prev)}
          className="text-primary hover:underline font-medium text-[11px]"
        >
          {showManualInputs ? "Hide coordinate inputs" : "Enter GPS coordinates manually"}
        </button>
      </div>

      {showManualInputs && (
        <div className="grid gap-3 sm:grid-cols-2 pt-2 border-t border-border/50">
          <div className="space-y-1">
            <Label htmlFor="manual-cust-lat" className="text-xs text-muted-foreground">
              Latitude (-90 to 90)
            </Label>
            <Input
              id="manual-cust-lat"
              type="number"
              step="any"
              placeholder="e.g. 7.058123"
              value={selectedLatitude === null ? "" : selectedLatitude}
              onChange={(e) => {
                const str = e.target.value.trim();
                const num = parseFloat(str);
                if (str === "" || isNaN(num)) {
                  onLocationChange(null);
                } else {
                  onLocationChange({
                    latitude: num,
                    longitude: selectedLongitude || (hasCafeCoords ? cafeLongitude! : 38.473),
                  });
                }
              }}
              className="h-8 text-xs font-mono"
              disabled={disabled}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="manual-cust-lng" className="text-xs text-muted-foreground">
              Longitude (-180 to 180)
            </Label>
            <Input
              id="manual-cust-lng"
              type="number"
              step="any"
              placeholder="e.g. 38.473123"
              value={selectedLongitude === null ? "" : selectedLongitude}
              onChange={(e) => {
                const str = e.target.value.trim();
                const num = parseFloat(str);
                if (str === "" || isNaN(num)) {
                  onLocationChange(null);
                } else {
                  onLocationChange({
                    latitude: selectedLatitude || (hasCafeCoords ? cafeLatitude! : 7.058),
                    longitude: num,
                  });
                }
              }}
              className="h-8 text-xs font-mono"
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  );
}
