
import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";

const BasicTreemapChart: React.FC = () => {
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
      data: [
        {
          x: "London",
          y: 218,
        },
        {
          x: "New York",
          y: 149,
        },
        {
          x: "Tokyo",
          y: 184,
        },
        {
          x: "Beijing",
          y: 55,
        },
        {
          x: "Paris",
          y: 84,
        },
        {
          x: "Chicago",
          y: 31,
        },
        {
          x: "Osaka",
          y: 70,
        },
        {
          x: "İstanbul",
          y: 30,
        },
        {
          x: "Bangkok",
          y: 44,
        },
        {
          x: "Madrid",
          y: 68,
        },
        {
          x: "Barcelona",
          y: 28,
        },
        {
          x: "Toronto",
          y: 19,
        },
        {
          x: "Shanghai",
          y: 29,
        },
      ],
    },
  ];

  const options: ApexOptions = {
    chart: {
      toolbar: {
        show: true,
      },
    },
    title: {
      text: "Basic Treemap",
      align: "left",
      offsetX: -9,
      style: {
        fontWeight: "500",
        fontSize: "14px",
        color: "#64748B",
      },
    },
  };

  return (
    <>
      <div className="trezo-card bg-white dark:bg-[#0c1427] p-[20px] md:p-[25px] rounded-md">
        <div className="trezo-card-header mb-[20px] md:mb-[25px] flex items-center justify-between">
          <div className="trezo-card-title">
            <h5 className="!mb-0">Basic Treemap Chart</h5>
          </div>
        </div>
        <div className="trezo-card-content">
          {ChartComponent ? (
            <ChartComponent
              options={options}
              series={series}
              type="treemap"
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

export default BasicTreemapChart;
