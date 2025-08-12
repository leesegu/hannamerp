
import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";

const BasicPolarChart: React.FC = () => {
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

  const series = [14, 23, 21, 17, 15, 10, 12, 17, 21];

  const options: ApexOptions = {
    chart: {
      toolbar: {
        show: true,
      },
    },
    stroke: {
      colors: ["#ffffff"],
    },
    fill: {
      opacity: 0.8,
    },
    labels: [
      "Bananas",
      "Apples",
      "Grapes",
      "Papayas",
      "Mangos",
      "Blueberrys",
      "Cherrys",
      "Oranges",
      "Pineapples",
    ],
    grid: {
      show: true,
      borderColor: "#ECEEF2",
    },
    legend: {
      show: true,
      position: "bottom",
      fontSize: "12px",
      horizontalAlign: "center",
      itemMargin: {
        horizontal: 8,
        vertical: 0,
      },
      labels: {
        colors: "#64748B",
      },
      markers: {
        size: 6,
        offsetX: -2,
        offsetY: -0.5,
        shape: "circle",
      },
    },
  };

  return (
    <>
      <div className="trezo-card bg-white dark:bg-[#0c1427] p-[20px] md:p-[25px] rounded-md">
        <div className="trezo-card-header mb-[20px] md:mb-[25px] flex items-center justify-between">
          <div className="trezo-card-title">
            <h5 className="!mb-0">Basic Polar Chart</h5>
          </div>
        </div>
        <div className="trezo-card-content">
          {ChartComponent ? (
            <ChartComponent
              options={options}
              series={series}
              type="polarArea"
              height={450}
              width={"100%"}
            />
          ) : (
            <div>Loading chart...</div>
          )}
        </div>
      </div>
    </>
  );
};

export default BasicPolarChart;
