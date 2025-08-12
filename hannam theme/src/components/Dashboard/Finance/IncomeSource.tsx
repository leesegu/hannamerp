
import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";

const IncomeSource: React.FC = () => {
  // Chart
  // State for dynamically loaded Chart component
  const [ChartComponent, setChartComponent] =
    useState<React.ComponentType<any> | null>(null);

  // Dynamically import react-apexcharts
  useEffect(() => {
    import("react-apexcharts").then((module) => {
      setChartComponent(() => module.default);
    });
  }, []);

  const series = [42, 47, 52, 58];

  const options: ApexOptions = {
    labels: ["$95k", "$60k", "$45k", "$22k"],
    fill: {
      opacity: 1,
    },
    stroke: {
      width: 0,
    },
    tooltip: {
      enabled: true,
      custom: function ({ series, seriesIndex, w }) {
        // Custom tooltip with detailed information like legend
        const category = w.globals.labels[seriesIndex]; // Use const instead of let
        const value = series[seriesIndex]; // Use const instead of let
        const percentage = (
          (value / w.globals.series.reduce((a: number, b: number) => a + b)) *
          100
        ).toFixed(2); // Use const instead of let
        return `<div style="padding: 10px; font-size: 13px; color: #333333; background: #ffffff; border-radius: 5px; box-shadow: 0 0 5px rgba(0, 0, 0, 0.2);">
              <strong>${category}</strong><br/>
              Value: $${value}K<br/>
              Contribution: ${percentage}%
          </div>`;
      },
    },
    legend: {
      show: true,
      position: "left",
      fontSize: "12px",
      // horizontalAlign: "bottom",
      offsetX: -24,
      offsetY: 15,
      customLegendItems: [
        "Product Sales",
        "Investments",
        "Salary",
        "Consulting",
      ],
      itemMargin: {
        horizontal: 0,
        vertical: 5,
      },
      labels: {
        colors: "#ECEEF2",
      },
      markers: {
        size: 6,
        offsetX: -2,
        offsetY: 0.5,
        shape: "square",
      },
    },
    plotOptions: {
      polarArea: {
        rings: {
          strokeWidth: 0,
        },
        spokes: {
          strokeWidth: 0,
        },
      },
    },
    theme: {
      monochrome: {
        enabled: true,
        shadeTo: "light",
        shadeIntensity: 0.6,
      },
    },
    dataLabels: {
      enabled: false,
      style: {
        fontSize: "11px",
      },
      dropShadow: {
        enabled: false,
      },
      formatter: function (_, opts) {
        return opts.w.globals.labels[opts.seriesIndex];
      },
      background: {
        padding: 5,
        opacity: 1,
        foreColor: "#ffffff",
        borderWidth: 0,
      },
    },
  };

  return (
    <>
      <div
        className="trezo-card p-[20px] md:p-[25px] rounded-md"
        style={{
          background: "linear-gradient(120deg, #343A46 0%, #23272E 99.29%)",
        }}
      >
        <div className="trezo-card-header mb-[20px] flex items-center justify-between">
          <div className="trezo-card-title">
            <h5 className="!mb-0 !text-white">Income Source</h5>
          </div>
          <div className="trezo-card-subtitle">
            <span className="block text-white">Last 30 days</span>
          </div>
        </div>
        <div className="trezo-card-content">
          <div className="-mt-[10px]">
            {ChartComponent ? (
              <ChartComponent
                options={options}
                series={series}
                type="polarArea"
                height={207}
                width={"100%"}
              />
            ) : (
              <div>Loading chart...</div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default IncomeSource;
