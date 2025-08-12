
import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";

const RangeColumnChart: React.FC = () => {
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
      name: "Blue",
      data: [
        {
          x: "Team A",
          y: [1, 5],
        },
        {
          x: "Team B",
          y: [4, 6],
        },
        {
          x: "Team C",
          y: [5, 8],
        },
        {
          x: "Team D",
          y: [3, 11],
        },
      ],
    },
    {
      name: "Green",
      data: [
        {
          x: "Team A",
          y: [2, 6],
        },
        {
          x: "Team B",
          y: [1, 3],
        },
        {
          x: "Team C",
          y: [7, 8],
        },
        {
          x: "Team D",
          y: [5, 9],
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
    colors: ["#605DFF", "#FD5812"],
    plotOptions: {
      bar: {
        horizontal: false,
      },
    },
    dataLabels: {
      enabled: true,
    },
    legend: {
      show: true,
      position: "top",
      fontSize: "12px",
      horizontalAlign: "left",
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
    grid: {
      show: true,
      borderColor: "#ECEEF2",
    },
    xaxis: {
      axisTicks: {
        show: false,
        color: "#ECEEF2",
      },
      axisBorder: {
        show: false,
        color: "#ECEEF2",
      },
      labels: {
        show: true,
        style: {
          colors: "#8695AA",
          fontSize: "12px",
        },
      },
    },
    yaxis: {
      tickAmount: 5,
      labels: {
        show: true,
        style: {
          colors: "#64748B",
          fontSize: "12px",
        },
      },
      axisBorder: {
        show: false,
        color: "#ECEEF2",
      },
      axisTicks: {
        show: false,
        color: "#ECEEF2",
      },
    },
  };

  return (
    <>
      <div className="trezo-card bg-white dark:bg-[#0c1427] p-[20px] md:p-[25px] rounded-md">
        <div className="trezo-card-header mb-[20px] md:mb-[25px] flex items-center justify-between">
          <div className="trezo-card-title">
            <h5 className="!mb-0">Range Column Chart</h5>
          </div>
        </div>
        <div className="trezo-card-content">
          {ChartComponent ? (
            <ChartComponent
              options={options}
              series={series}
              type="bar"
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

export default RangeColumnChart;
