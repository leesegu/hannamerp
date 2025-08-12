
import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";

const AverageDeliveryTime: React.FC = () => {
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

  const data = [70, 60, 80, 100, 70, 40, 80];
  const middleIndex = Math.floor(data.length / 2);

  const options: ApexOptions = {
    chart: {
      toolbar: {
        show: false,
      },
    },
    colors: data.map((_, index) =>
      index === middleIndex ? "#3584FC" : "#BDDCFF"
    ),
    plotOptions: {
      bar: {
        columnWidth: "18.35px",
        borderRadius: 0,
        distributed: true,
        horizontal: false,
      },
    },
    grid: {
      show: true,
      strokeDashArray: 5,
      borderColor: "#EEF1FF",
    },
    dataLabels: {
      enabled: false,
    },
    xaxis: {
      categories: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
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
      show: false,
      tickAmount: 5,
      labels: {
        formatter: (val) => `${val} minutes`,
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
    tooltip: {
      y: {
        formatter: function (val) {
          return `${val} minutes`;
        },
      },
    },
    legend: {
      show: false,
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
        shape: "square",
      },
    },
  };

  const series = [
    {
      name: "Time",
      data: data,
    },
  ];

  return (
    <>
      <div className="trezo-card bg-white dark:bg-[#0c1427] p-[20px] md:p-[25px] rounded-md">
        <div className="trezo-card-header mb-[20px] md:mb-[25px] flex items-center justify-between">
          <div className="trezo-card-title">
            <span className="block">Average Delivery Time</span>
          </div>
          <div className="trezo-card-subtitle">
            <span className="block">Per Week</span>
          </div>
        </div>

        <div className="trezo-card-content">
          <div className="-mt-[28px] -mb-[22px]">
            {ChartComponent ? (
              <ChartComponent
                options={options}
                series={series}
                type="bar"
                height={186}
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

export default AverageDeliveryTime;
