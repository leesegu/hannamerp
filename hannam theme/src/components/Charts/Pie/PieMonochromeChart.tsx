
import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";

const PieMonochromeChart: React.FC = () => {
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

  const series = [25, 15, 44, 55, 41, 17];

  const options: ApexOptions = {
    labels: [
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ],
    theme: {
      monochrome: {
        enabled: true,
      },
    },
    legend: {
      show: true,
      offsetY: 0,
      fontSize: "12px",
      labels: {
        colors: "#64748B",
      },
      itemMargin: {
        horizontal: 0,
        vertical: 5,
      },
      markers: {
        size: 6,
        offsetX: -2,
        offsetY: -0.5,
        shape: "circle",
      },
    },
    dataLabels: {
      enabled: false,
    },
  };

  return (
    <>
      <div className="trezo-card bg-white dark:bg-[#0c1427] p-[20px] md:p-[25px] rounded-md">
        <div className="trezo-card-header mb-[20px] md:mb-[25px] flex items-center justify-between">
          <div className="trezo-card-title">
            <h5 className="!mb-0">Pie Monochrome Chart</h5>
          </div>
        </div>
        <div className="trezo-card-content">
          {ChartComponent ? (
            <ChartComponent
              options={options}
              series={series}
              type="pie"
              height={320}
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

export default PieMonochromeChart;
