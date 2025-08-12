
import React, { useState, useEffect } from "react";
import type { ApexOptions } from "apexcharts";

const RiskStabilityIndicators: React.FC = () => {
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

  const series = [
    {
      name: "Liquidity",
      data: [60, 80, 100, 120, 140, 150],
    },
    {
      name: "Volatility",
      data: [180, 160, 80, 140, 100, 80],
    },
    {
      name: "Operational",
      data: [100, 130, 140, 60, 40, 20],
    },
  ];

  const options: ApexOptions = {
    chart: {
      toolbar: {
        show: false,
      },
    },
    xaxis: {
      labels: {
        show: false,
      },
    },
    fill: {
      type: "gradient",
      gradient: {
        stops: [0, 90, 100],
        shadeIntensity: 1,
        opacityFrom: 0,
        opacityTo: 0.4,
      },
    },
    colors: ["#AD63F6", "#605DFF", "#37D80A"],
    yaxis: {
      show: true,
      tickAmount: 4,
    },
    legend: {
      show: true,
      fontSize: "12px",
      position: "bottom",
      horizontalAlign: "center",
      itemMargin: {
        horizontal: 8,
        vertical: 6,
      },
      labels: {
        colors: "#64748B",
      },
      markers: {
        size: 6,
        offsetX: -2,
        offsetY: -0.5,
        shape: "square",
      },
      customLegendItems: ["Liquidity 50%", "Volatility 20%", "Operational 30%"],
    },
  };

  return (
    <>
      <div className="trezo-card bg-white dark:bg-[#0c1427] p-[20px] md:p-[25px] rounded-md">
        <div className="trezo-card-header mb-[20px] md:mb-[25px] flex items-center justify-between">
          <div className="trezo-card-title">
            <h5 className="!mb-0">Risk & Stability Indicators</h5>
          </div>
        </div>

        <div className="trezo-card-content">
          <div>
            {ChartComponent ? (
              <ChartComponent
                options={options}
                series={series}
                type="radar"
                height={350}
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

export default RiskStabilityIndicators;
