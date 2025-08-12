
import React, { useEffect, useState } from "react";
import type { ApexOptions } from "apexcharts";

const BasicAreaChart: React.FC = () => {
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
      name: "STOCK ABC",
      data: [
        8107.85, 8128.0, 8122.9, 8165.5, 8340.7, 8423.7, 8423.5, 8514.3,
        8481.85, 8487.7, 8506.9, 8626.2, 8668.95, 8602.3, 8607.55, 8512.9,
        8496.25, 8600.65, 8881.1, 9340.85,
      ],
    },
  ];

  const options: ApexOptions = {
    chart: {
      zoom: {
        enabled: false,
      },
      toolbar: {
        show: true,
      },
    },
    dataLabels: {
      enabled: false,
    },
    colors: ["#605DFF"],
    stroke: {
      curve: "straight",
    },
    title: {
      text: "Fundamental Analysis of Stocks",
      align: "left",
      offsetX: -9,
      style: {
        fontWeight: "500",
        fontSize: "14px",
        color: "#64748B",
      },
    },
    subtitle: {
      text: "Price Movements",
      align: "left",
      offsetX: -9,
      style: {
        fontWeight: "normal",
        fontSize: "13px",
        color: "#64748B",
      },
    },
    labels: [
      "13 Nov 2024",
      "14 Nov 2024",
      "15 Nov 2024",
      "16 Nov 2024",
      "17 Nov 2024",
      "20 Nov 2024",
      "21 Nov 2024",
      "22 Nov 2024",
      "23 Nov 2024",
      "24 Nov 2024",
      "27 Nov 2024",
      "28 Nov 2024",
      "29 Nov 2024",
      "30 Nov 2024",
      "01 Dec 2024",
      "04 Dec 2024",
      "05 Dec 2024",
      "06 Dec 2024",
      "07 Dec 2024",
      "08 Dec 2024",
    ],
    xaxis: {
      type: "datetime",
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
    grid: {
      show: true,
      borderColor: "#ECEEF2",
    },
    yaxis: {
      opposite: true,
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
            <h5 className="!mb-0">Basic Line Chart</h5>
          </div>
        </div>
        <div className="trezo-card-content">
          {ChartComponent ? (
            <ChartComponent
              options={options}
              series={series}
              type="area"
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

export default BasicAreaChart;
