
import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";

const MultipleRadarChart: React.FC = () => {
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
      name: "Series Blue",
      data: [80, 50, 30, 40, 100, 20],
    },
    {
      name: "Series Green",
      data: [20, 30, 40, 80, 20, 80],
    },
    {
      name: "Series Orange",
      data: [44, 76, 78, 13, 43, 10],
    },
  ];

  const options: ApexOptions = {
    chart: {
      dropShadow: {
        enabled: true,
        blur: 1,
        left: 1,
        top: 1,
      },
    },
    title: {
      text: "Radar Chart - Multi Series",
      align: "left",
      offsetX: -9,
      style: {
        fontWeight: "500",
        fontSize: "14px",
        color: "#64748B",
      },
    },
    stroke: {
      width: 0,
    },
    fill: {
      opacity: 0.4,
    },
    markers: {
      size: 0,
    },
    xaxis: {
      categories: ["2011", "2012", "2013", "2014", "2015", "2016"],
      labels: {
        style: {
          colors: "#8695AA",
          fontSize: "12px",
        },
      },
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
            <h5 className="!mb-0">Multiple Radar Chart</h5>
          </div>
        </div>
        <div className="trezo-card-content">
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
    </>
  );
};

export default MultipleRadarChart;
