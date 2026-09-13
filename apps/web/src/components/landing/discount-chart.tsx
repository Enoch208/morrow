"use client";

import Chart from "chart.js/auto";
import { useEffect, useRef } from "react";
import type { DiscountPoint } from "@/lib/format/sale-economics";

const gridColor = "rgba(255, 255, 255, 0.03)";
const tickColor = "#525252";

export function DiscountChart({
  fontFamily,
  points,
}: {
  fontFamily: string;
  points: readonly DiscountPoint[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const context = canvasRef.current?.getContext("2d");
    if (!context) {
      return;
    }

    const gradient = context.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, "rgba(220, 38, 38, 0.5)");
    gradient.addColorStop(1, "rgba(220, 38, 38, 0.0)");

    const chart = new Chart(context, {
      type: "line",
      data: {
        labels: points.map((point) => point.priceLabel),
        datasets: [
          {
            label: "Holding-period return",
            data: points.map((point) => point.holdingReturnPercent),
            borderColor: "#ef4444",
            backgroundColor: gradient,
            borderWidth: 2,
            tension: 0.4,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: true,
          },
          {
            label: "Discount to face",
            data: points.map((point) => point.discountToFacePercent),
            borderColor: "#404040",
            borderWidth: 2,
            borderDash: [5, 5],
            tension: 0.4,
            pointRadius: 0,
            fill: false,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: "index",
            intersect: false,
            backgroundColor: "rgba(10, 10, 10, 0.9)",
            titleColor: "#fff",
            bodyColor: "#a3a3a3",
            borderColor: "rgba(255,255,255,0.1)",
            borderWidth: 1,
            padding: 10,
            displayColors: false,
            titleFont: { family: fontFamily, size: 10 },
            bodyFont: { family: fontFamily, size: 10 },
          },
        },
        scales: {
          x: {
            grid: { color: gridColor },
            ticks: { color: tickColor, font: { family: fontFamily, size: 9 }, maxRotation: 0 },
          },
          y: {
            grid: { color: gridColor },
            ticks: {
              color: tickColor,
              font: { family: fontFamily, size: 9 },
              callback: (value) => `${String(value)}%`,
            },
            min: 0,
            max: 12,
          },
        },
        interaction: { intersect: false, mode: "index" },
      },
    });

    return () => {
      chart.destroy();
    };
  }, [fontFamily, points]);

  return <canvas ref={canvasRef} />;
}
